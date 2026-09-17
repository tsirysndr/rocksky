//! Filling in album art from `api.rocksky.app`.
//!
//! An album row is created by whichever record first mentioned the album, and
//! a scrobble carries the *track's* cover, not the album's. So an album first
//! seen through a record with no cover has none, and on an instance filled
//! from the firehose that is a large fraction of them.
//!
//! See [the module above](super) for why this asks the hosted API and how the
//! two sweeps share one rate-limited request budget.
//!
//! # Two passes, and the cheap one runs first
//!
//! | pass                          | cost        | fills                                    |
//! |-------------------------------|-------------|------------------------------------------|
//! | [`fill_from_tracks`]          | one `UPDATE`| albums whose own tracks have real art    |
//! | the API batch                 | one request | everything still missing after that      |
//!
//! The first costs nothing and is surprisingly effective: the tracks of an
//! album are ingested from records that *do* carry covers, so the art is
//! frequently already in this database one join away. Whatever it cannot
//! reach is asked about, so the rate-limited requests are spent only on
//! albums this instance genuinely cannot answer for itself.
//!
//! # Matching on sha256
//!
//! ```text
//! GET /xrpc/app.rocksky.album.getAlbums?filter=sha256=in=(h1,h2,…)&limit=31
//! → { "albums": [ { "sha256": …, "albumArt": … } ] }
//! ```
//!
//! `sha256` is `album_hash(title, albumArtist)` — computed identically on both
//! instances, filterable upstream, and unique, so a batch of hashes comes back
//! as at most that many albums with no ambiguity about which is which. How
//! many fit in one request is [`BATCH`].
//!
//! Matching on the hash rather than the title also avoids the artist sweep's
//! comma problem entirely: a hash is hex, so it can never need escaping
//! inside the `=in=` list. That is enforced rather than assumed — see
//! [`is_hash`].

use super::{Outcome, TIMEOUT, UNKNOWN_TTL};
use crate::db::schema::{AlbumTracks, Albums, Tracks};
use crate::db::Backend;
use crate::ingest::{album_art_is_missing, fill_album_art, usable_album_art};
use crate::sea_query::{Alias, Expr, Func, JoinType, Order, Query};
use crate::state::AppState;
use serde::Deserialize;

/// The longest `filter` the endpoint accepts.
///
/// Not a guess: over this it answers
/// `400 {"error":"InvalidRequest","message":"… filter must not be longer than
/// 2048 characters"}`. Worth stating as a constant because it is the only
/// thing deciding [`BATCH`] — a batch chosen for any other reason silently
/// fails the whole request, and one oversized request means a wasted tick and
/// a five-minute backoff.
const MAX_FILTER_CHARS: usize = 2048;

/// `sha256=in=(` … `)`
const FILTER_OVERHEAD: usize = 11;

/// A hex sha256.
const HASH_CHARS: usize = 64;

/// Albums asked about per request: as many as fit in the filter.
///
/// Each hash costs its 64 characters plus a separator, so this is the largest
/// batch that stays inside [`MAX_FILTER_CHARS`] — 31, at the time of writing.
/// [`the_batch_fits_the_filter_limit`] is what keeps that true if any of these
/// change.
const BATCH: i64 = ((MAX_FILTER_CHARS - FILTER_OVERHEAD) / (HASH_CHARS + 1)) as i64;

/// Albums filled from their own tracks per pass.
///
/// Bounded like the API batch even though it costs no request: it is one
/// `UPDATE` per album, and a pass that tried to fix ten thousand at once
/// would hold the write connection for as long as it took.
const LOCAL_BATCH: i64 = 200;

#[derive(Debug, Deserialize)]
struct AlbumsResponse {
    #[serde(default)]
    albums: Vec<RemoteAlbum>,
}

/// An album as the API describes it.
///
/// Only the two fields this needs. `playCount`, `uniqueListeners` and the
/// track list are in the response and describe the *hosted* instance's data,
/// which would be wrong to copy here.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RemoteAlbum {
    #[serde(default)]
    sha256: Option<String>,
    #[serde(default)]
    album_art: Option<String>,
}

/// Where the last pass got to. See [`super::Cursor`].
static CURSOR: super::Cursor = super::Cursor::new();

/// Runs one pass: the free local fill first, then one batch of requests.
pub async fn run_batch(state: &AppState) -> anyhow::Result<Outcome> {
    // Before anything else, and regardless of whether a source is configured:
    // this needs no network at all.
    let local = fill_from_tracks(state.db(), LOCAL_BATCH).await?;
    if local > 0 {
        // Report it as a filled pass without spending a request, so the next
        // tick comes back here and keeps draining the cheap source first.
        tracing::debug!(albums = local, "filled album art from tracks already held");
        return Ok(Outcome::Filled(local));
    }

    let Some(source) = super::source(state) else {
        return Ok(Outcome::Idle);
    };

    let candidates = incomplete(state.db(), BATCH * 2, CURSOR.offset()).await?;
    if candidates.is_empty() {
        // Off the end of the table; the next lap starts from the top.
        CURSOR.rewind();
        return Ok(Outcome::Idle);
    }
    CURSOR.advance(candidates.len() as u64);

    // Hashes asked about recently are skipped without a request; the cursor is
    // what makes the next pass read different rows — see [`super::Cursor`].
    let mut wanted = Vec::new();
    for hash in candidates {
        if !is_hash(&hash) {
            // Cannot be the hash of anything the API knows, and must never be
            // interpolated into a filter expression.
            tracing::warn!(hash = %hash, "skipping an album with a malformed sha256");
            continue;
        }
        if state.cache().get(&unknown_key(&hash)).await.is_none() {
            wanted.push(hash);
        }
        if wanted.len() as i64 >= BATCH {
            break;
        }
    }
    if wanted.is_empty() {
        return Ok(Outcome::Idle);
    }

    let Some(found) = fetch(state, &source, &wanted).await? else {
        return Ok(Outcome::RateLimited);
    };

    let mut filled = 0;
    let mut answered = std::collections::HashSet::new();
    for album in &found {
        let Some(hash) = album.sha256.as_deref() else {
            continue;
        };
        if fill_album_art(state.db(), hash, album.album_art.as_deref()).await? {
            filled += 1;
        }
        // Answered *with art*. An album the API holds but has no cover for is
        // no more use than one it has never heard of, so it is marked too —
        // otherwise it fills a slot in every future batch forever.
        if usable_album_art(album.album_art.as_deref()).is_some() {
            answered.insert(hash.to_string());
        }
    }

    for hash in &wanted {
        if !answered.contains(hash) {
            state
                .cache()
                .set_ex(&unknown_key(hash), UNKNOWN_TTL, "1")
                .await;
        }
    }

    Ok(Outcome::Filled(filled))
}

/// Asks the API about these hashes.
///
/// `Ok(None)` means rate limited, which the caller turns into a wait rather
/// than an error — it is the expected answer when a sweep runs too eagerly,
/// not a failure.
async fn fetch(
    state: &AppState,
    source: &str,
    hashes: &[String],
) -> anyhow::Result<Option<Vec<RemoteAlbum>>> {
    let url = format!(
        "{}/xrpc/app.rocksky.album.getAlbums",
        source.trim_end_matches('/')
    );

    let response = state
        .http()
        .get(&url)
        .query(&[
            ("filter", filter_for(hashes)),
            // Or the answer is truncated to the endpoint's default page size
            // and most of the batch comes back looking unknown.
            ("limit", hashes.len().to_string()),
        ])
        .timeout(TIMEOUT)
        .send()
        .await?;

    let status = response.status();
    if status.as_u16() == 429 || status.is_server_error() {
        return Ok(None);
    }
    if !status.is_success() {
        anyhow::bail!("{url} answered {status}");
    }

    Ok(Some(response.json::<AlbumsResponse>().await?.albums))
}

/// The RSQL filter selecting exactly these albums.
fn filter_for(hashes: &[String]) -> String {
    format!("sha256=in=({})", hashes.join(","))
}

/// Whether this is a hash, and so safe to put in a filter expression.
///
/// The filter is a string the far end parses, and these values come from a
/// database column rather than from a constant — so this is checked, not
/// assumed. A hash cannot contain a comma, a quote or a parenthesis, which is
/// what makes the `=in=` list unambiguous.
fn is_hash(value: &str) -> bool {
    value.len() == 64 && value.chars().all(|c| c.is_ascii_hexdigit())
}

/// Fills album art from a track of the same album, where one has real art.
///
/// Costs no request: the tracks were ingested from records that carry covers,
/// so for many albums the art is already in this database one join away.
///
/// Returns how many albums were filled.
async fn fill_from_tracks(db: &Backend, limit: i64) -> anyhow::Result<usize> {
    let mut filled = 0;
    for (hash, art) in art_held_by_tracks(db, limit).await? {
        if fill_album_art(db, &hash, Some(&art)).await? {
            filled += 1;
        }
    }
    Ok(filled)
}

/// Art-less albums paired with the cover one of their own tracks carries.
///
/// `MIN` rather than an arbitrary row: with several tracks carrying different
/// covers — a deluxe edition, a single reissued onto the album — any of them
/// is right, but the choice has to be deterministic or a re-run would keep
/// rewriting the same album with a different cover.
async fn art_held_by_tracks(
    db: &Backend,
    limit: i64,
) -> Result<Vec<(String, String)>, sqlx::Error> {
    let real_track_art = crate::sea_query::Cond::all()
        .add(Expr::col((Tracks::Table, Tracks::AlbumArt)).is_not_null())
        .add(Expr::col((Tracks::Table, Tracks::AlbumArt)).ne(""))
        .add(
            Expr::col((Tracks::Table, Tracks::AlbumArt))
                .ne(rocksky_core::identity::PLACEHOLDER_ALBUM_ART),
        );

    let query = Query::select()
        .column((Albums::Table, Albums::Sha256))
        .expr_as(
            Func::min(Expr::col((Tracks::Table, Tracks::AlbumArt))),
            Alias::new("art"),
        )
        .from(Albums::Table)
        .join(
            JoinType::InnerJoin,
            AlbumTracks::Table,
            Expr::col((AlbumTracks::Table, AlbumTracks::AlbumId))
                .equals((Albums::Table, Albums::XataId)),
        )
        .join(
            JoinType::InnerJoin,
            Tracks::Table,
            Expr::col((Tracks::Table, Tracks::XataId))
                .equals((AlbumTracks::Table, AlbumTracks::TrackId)),
        )
        .cond_where(album_art_is_missing((Albums::Table, Albums::AlbumArt)))
        .cond_where(real_track_art)
        .add_group_by([Expr::col((Albums::Table, Albums::Sha256)).into()])
        .limit(limit as u64)
        .to_owned();

    db.fetch_all::<(String, String)>(&query).await
}

/// Albums with no art, oldest first, from `offset`.
///
/// Oldest first so a long backfill is worked through in arrival order; the
/// offset is what stops a pass re-reading albums the API cannot fill — see
/// [`super::Cursor`].
async fn incomplete(db: &Backend, limit: i64, offset: u64) -> Result<Vec<String>, sqlx::Error> {
    let query = Query::select()
        .column(Albums::Sha256)
        .from(Albums::Table)
        .cond_where(album_art_is_missing(Albums::AlbumArt))
        .order_by(Albums::XataCreatedat, Order::Asc)
        .limit(limit as u64)
        .offset(offset)
        .to_owned();

    db.fetch_scalars::<String>(&query).await
}

/// How many albums are still missing art, for the startup log.
pub async fn pending_count(db: &Backend) -> Result<i64, sqlx::Error> {
    let query = Query::select()
        .expr(db.cast_int(Func::count(Expr::col(Albums::XataId))))
        .from(Albums::Table)
        .cond_where(album_art_is_missing(Albums::AlbumArt))
        .to_owned();
    db.count(&query).await
}

fn unknown_key(hash: &str) -> String {
    format!("album-art-unknown:{hash}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use rocksky_core::identity::{album_hash, PLACEHOLDER_ALBUM_ART};

    /// An album, its art, and a track on it carrying `track_art`.
    async fn seed(db: &Backend, title: &str, art: Option<&str>, track_art: Option<&str>) -> String {
        let hash = album_hash(title, "An Artist");
        let album_id = crate::db::new_id();
        let insert = Query::insert()
            .into_table(Albums::Table)
            .columns([
                Albums::XataId,
                Albums::Title,
                Albums::Artist,
                Albums::AlbumArt,
                Albums::Sha256,
            ])
            .values_panic([
                album_id.clone().into(),
                title.into(),
                "An Artist".into(),
                art.into(),
                hash.clone().into(),
            ])
            .to_owned();
        db.execute(&insert).await.unwrap();

        if let Some(track_art) = track_art {
            let track_id = crate::db::new_id();
            let insert = Query::insert()
                .into_table(Tracks::Table)
                .columns([
                    Tracks::XataId,
                    Tracks::Title,
                    Tracks::Artist,
                    Tracks::AlbumArtist,
                    Tracks::Album,
                    Tracks::AlbumArt,
                    // NOT NULL, and not something this cares about.
                    Tracks::Duration,
                    Tracks::Sha256,
                ])
                .values_panic([
                    track_id.clone().into(),
                    format!("{title} track").into(),
                    "An Artist".into(),
                    "An Artist".into(),
                    title.into(),
                    track_art.into(),
                    200_000.into(),
                    rocksky_core::identity::track_hash(
                        &format!("{title} track"),
                        "An Artist",
                        title,
                    )
                    .into(),
                ])
                .to_owned();
            db.execute(&insert).await.unwrap();

            let insert = Query::insert()
                .into_table(AlbumTracks::Table)
                .columns([
                    AlbumTracks::XataId,
                    AlbumTracks::AlbumId,
                    AlbumTracks::TrackId,
                ])
                .values_panic([crate::db::new_id().into(), album_id.into(), track_id.into()])
                .to_owned();
            db.execute(&insert).await.unwrap();
        }

        hash
    }

    async fn art_of(db: &Backend, hash: &str) -> Option<String> {
        let query = Query::select()
            .column(Albums::AlbumArt)
            .from(Albums::Table)
            .and_where(Expr::col(Albums::Sha256).eq(hash))
            .to_owned();
        db.fetch_optional::<(Option<String>,)>(&query)
            .await
            .unwrap()
            .expect("the album exists")
            .0
    }

    /// The three values that mean "no art". The placeholder is the subtle one:
    /// it is a real URL, so a naive NULL check leaves every album that went
    /// through it looking filled while showing a grey square.
    #[tokio::test]
    async fn all_three_empty_states_count_as_missing() {
        let db = crate::db::connect_in_memory().await.unwrap();
        seed(&db, "Null Art", None, None).await;
        seed(&db, "Empty Art", Some(""), None).await;
        seed(&db, "Placeholder Art", Some(PLACEHOLDER_ALBUM_ART), None).await;
        seed(&db, "Real Art", Some("https://cdn/real.jpg"), None).await;

        assert_eq!(pending_count(&db).await.unwrap(), 3);
        assert_eq!(incomplete(&db, 10, 0).await.unwrap().len(), 3);
    }

    /// The free pass: art already in this database, one join away.
    #[tokio::test]
    async fn art_is_taken_from_the_albums_own_tracks() {
        let db = crate::db::connect_in_memory().await.unwrap();
        let needs = seed(&db, "Needs Art", None, Some("https://cdn/from-track.jpg")).await;
        // A track carrying only the placeholder is no help.
        let hopeless = seed(&db, "Hopeless", None, Some(PLACEHOLDER_ALBUM_ART)).await;

        assert_eq!(fill_from_tracks(&db, 100).await.unwrap(), 1);
        assert_eq!(
            art_of(&db, &needs).await.as_deref(),
            Some("https://cdn/from-track.jpg")
        );
        assert_eq!(art_of(&db, &hopeless).await, None);

        // And a second pass has nothing left to do, so a tick is not spent on
        // rewriting the same rows.
        assert_eq!(fill_from_tracks(&db, 100).await.unwrap(), 0);
    }

    /// Real art already stored came from a record naming this album, so
    /// neither pass may replace it.
    #[tokio::test]
    async fn existing_art_is_never_replaced() {
        let db = crate::db::connect_in_memory().await.unwrap();
        let kept = seed(
            &db,
            "Has Art",
            Some("https://cdn/local.jpg"),
            Some("https://cdn/from-track.jpg"),
        )
        .await;

        assert_eq!(fill_from_tracks(&db, 100).await.unwrap(), 0);
        assert!(!fill_album_art(&db, &kept, Some("https://cdn/remote.jpg"))
            .await
            .unwrap());
        assert_eq!(
            art_of(&db, &kept).await.as_deref(),
            Some("https://cdn/local.jpg")
        );
    }

    /// The placeholder *is* replaced, though — that is the whole point of
    /// treating it as missing.
    #[tokio::test]
    async fn the_placeholder_is_replaced() {
        let db = crate::db::connect_in_memory().await.unwrap();
        let hash = seed(&db, "Grey Square", Some(PLACEHOLDER_ALBUM_ART), None).await;

        assert!(fill_album_art(&db, &hash, Some("https://cdn/real.jpg"))
            .await
            .unwrap());
        assert_eq!(
            art_of(&db, &hash).await.as_deref(),
            Some("https://cdn/real.jpg")
        );
    }

    /// An answer carrying nothing usable is not a write.
    #[tokio::test]
    async fn an_empty_answer_changes_nothing() {
        let db = crate::db::connect_in_memory().await.unwrap();
        let hash = seed(&db, "Needs Art", None, None).await;

        for art in [None, Some(""), Some("   "), Some(PLACEHOLDER_ALBUM_ART)] {
            assert!(
                !fill_album_art(&db, &hash, art).await.unwrap(),
                "{art:?} is not album art"
            );
        }
        assert_eq!(art_of(&db, &hash).await, None);
    }

    /// The filter is parsed by the far end, so what goes into it is checked
    /// rather than trusted.
    #[test]
    fn only_hashes_reach_the_filter() {
        let hash = album_hash("An Album", "An Artist");
        assert!(is_hash(&hash));
        assert!(is_hash(&"a".repeat(64)));

        assert!(!is_hash(""));
        assert!(!is_hash(&"a".repeat(63)), "too short");
        assert!(!is_hash(&"a".repeat(65)), "too long");
        assert!(!is_hash("not-a-hash"));
        // The values that would change what the far end parses.
        assert!(!is_hash(&format!("{},{}", &hash[..31], &hash[..32])));
        assert!(!is_hash(&format!("{})", &hash[..63])));
    }

    #[test]
    fn the_filter_selects_exactly_the_batch() {
        assert_eq!(filter_for(&["aa".into(), "bb".into()]), "sha256=in=(aa,bb)");
        assert_eq!(filter_for(&["aa".into()]), "sha256=in=(aa)");
    }

    /// A full batch has to fit the endpoint's filter limit, or every request
    /// is a `400` and the sweep never fills anything — which is exactly what
    /// a batch of fifty did.
    #[test]
    fn the_batch_fits_the_filter_limit() {
        let hashes = vec!["a".repeat(HASH_CHARS); BATCH as usize];
        let filter = filter_for(&hashes);
        assert_eq!(
            filter.len(),
            FILTER_OVERHEAD + (HASH_CHARS + 1) * BATCH as usize,
            "the overhead constant no longer matches what filter_for builds"
        );
        assert!(
            filter.len() <= MAX_FILTER_CHARS,
            "a full batch is {} characters, over the {MAX_FILTER_CHARS} limit",
            filter.len()
        );

        // And it is the *largest* such batch — otherwise requests are being
        // spent on smaller batches than the endpoint would accept.
        let one_more = vec!["a".repeat(HASH_CHARS); BATCH as usize + 1];
        assert!(
            filter_for(&one_more).len() > MAX_FILTER_CHARS,
            "one more hash would still fit; the batch is smaller than it needs to be"
        );
    }

    /// The API's own field names, which are camelCase on the wire.
    #[test]
    fn the_response_shape_is_the_apis() {
        let parsed: AlbumsResponse = serde_json::from_str(
            r#"{"albums":[
                {"sha256":"abc","albumArt":"https://cdn/a.jpg","playCount":99},
                {"sha256":"def"}
            ]}"#,
        )
        .unwrap();

        assert_eq!(parsed.albums.len(), 2);
        assert_eq!(parsed.albums[0].sha256.as_deref(), Some("abc"));
        assert_eq!(
            parsed.albums[0].album_art.as_deref(),
            Some("https://cdn/a.jpg")
        );
        // An album the API knows but has no cover for.
        assert_eq!(parsed.albums[1].album_art, None);

        // And an empty answer is not an error.
        let empty: AlbumsResponse = serde_json::from_str("{}").unwrap();
        assert!(empty.albums.is_empty());
    }
}
