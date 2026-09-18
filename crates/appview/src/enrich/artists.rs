//! Filling in artist pictures and genres from `api.rocksky.app`.
//!
//! A scrobble record carries the track's metadata but nothing about the
//! artist, so an artist created from the firehose has a name and nothing else.
//! See [the module above](super) for why this asks the hosted API at all and
//! how the two sweeps share one rate-limited request budget.
//!
//! The endpoint and the field names are the ones `rockbox-zig` uses for the
//! same job (`crates/library/src/artists.rs`):
//!
//! ```text
//! GET /xrpc/app.rocksky.artist.getArtists?names=A,B,C
//! → { "artists": [ { "name": …, "picture": …, "genres": [ … ] } ] }
//! ```
//!
//! # Names containing a comma
//!
//! The endpoint takes `names` as one comma-separated string, so a name like
//! "Earth, Wind & Fire" cannot be batched — it would arrive as two names and
//! match neither. Those go one per request instead of being silently
//! corrupted, which is what `rockbox-zig`'s straight `join(",")` does.

use super::{Outcome, TIMEOUT, UNKNOWN_TTL};
use crate::db::schema::Artists;
use crate::db::Backend;
use crate::sea_query::{Expr, Order, Query};
use crate::state::AppState;
use serde::Deserialize;

/// Artists asked about per request.
///
/// Fifty names is a query string of a few kilobytes — comfortably inside any
/// URL limit, and fifty times fewer requests than asking one at a time.
const BATCH: i64 = 50;

#[derive(Debug, Deserialize)]
struct ArtistsResponse {
    #[serde(default)]
    artists: Vec<RemoteArtist>,
}

/// An artist as the API describes it.
///
/// Only the three fields this needs. `playCount` and `uniqueListeners` are in
/// the response and describe the *hosted* instance's data, which would be
/// wrong to copy here.
#[derive(Debug, Deserialize)]
struct RemoteArtist {
    name: String,
    #[serde(default)]
    picture: Option<String>,
    #[serde(default)]
    genres: Vec<String>,
}

/// Where the last pass got to. See [`super::Cursor`].
static CURSOR: super::Cursor = super::Cursor::new();

/// Asks about one batch of artists and fills in what comes back.
pub async fn run_batch(state: &AppState) -> anyhow::Result<Outcome> {
    let Some(source) = super::source(state) else {
        return Ok(Outcome::Idle);
    };

    let candidates = incomplete(state.db(), BATCH * 2, CURSOR.offset()).await?;
    if candidates.is_empty() {
        // Off the end of the table. Start the next lap from the top, where by
        // now there may be new artists — or old ones whose marker has aged out.
        CURSOR.rewind();
        return Ok(Outcome::Idle);
    }
    CURSOR.advance(candidates.len() as u64);

    // Names asked about recently are skipped without a request; the cursor is
    // what makes the *next* pass read different rows — see `asked_key` and
    // [`super::Cursor`].
    let mut wanted = Vec::new();
    for name in candidates {
        if state.cache().get(&asked_key(&name)).await.is_none() {
            wanted.push(name);
        }
        if wanted.len() as i64 >= BATCH {
            break;
        }
    }
    if wanted.is_empty() {
        // Every candidate was asked about recently, so there is nothing to ask.
        return Ok(Outcome::Idle);
    }

    // A name with a comma cannot share a request — see the module note.
    let (batchable, individual): (Vec<String>, Vec<String>) =
        wanted.into_iter().partition(|name| !name.contains(','));

    let mut asked: Vec<String> = Vec::new();
    let mut found: Vec<RemoteArtist> = Vec::new();

    for group in std::iter::once(batchable)
        .filter(|group| !group.is_empty())
        .chain(individual.into_iter().map(|name| vec![name]))
    {
        asked.extend(group.iter().cloned());
        match fetch(state, &source, &group).await? {
            Some(artists) => found.extend(artists),
            // Stop at the first refusal rather than spending the rest of the
            // batch on requests that will be refused too.
            None => return Ok(Outcome::RateLimited),
        }
    }

    // Every name asked about is marked, answered or not — see [`asked_key`].
    for name in &asked {
        state
            .cache()
            .set_ex(&asked_key(name), UNKNOWN_TTL, "1")
            .await;
    }

    let mut filled = 0;
    for artist in &found {
        if apply(state.db(), artist).await? {
            filled += 1;
        }
    }

    Ok(Outcome::Filled(filled))
}

/// Asks the API about these names.
///
/// `Ok(None)` means rate limited, which the caller turns into a wait rather
/// than an error — it is the expected answer when a sweep runs too eagerly,
/// not a failure.
async fn fetch(
    state: &AppState,
    source: &str,
    names: &[String],
) -> anyhow::Result<Option<Vec<RemoteArtist>>> {
    let url = format!(
        "{}/xrpc/app.rocksky.artist.getArtists",
        source.trim_end_matches('/')
    );

    let response = state
        .http()
        .get(&url)
        .query(&[("names", names.join(","))])
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

    Ok(Some(response.json::<ArtistsResponse>().await?.artists))
}

/// Writes a picture and genres onto the matching row, filling only gaps.
///
/// Matched on the content hash of the name, which is how every artist row is
/// keyed — matching on the name itself would need the same lowercasing and
/// trimming the hash already encodes.
///
/// One statement per field, each guarded in its `WHERE`. Two reasons rather
/// than one `UPDATE` with `COALESCE`:
///
///   * `COALESCE(picture, …)` keeps an empty string, because `''` is not NULL
///     — so a row stored with `''` would never be filled while looking as
///     though it had been.
///   * a single statement also writes `xata_updatedat`, so it reports a row
///     changed even when neither value was new, and the "filled" count in the
///     log becomes fiction.
///
/// Guarding in the `WHERE` makes "was this actually a gap" the database's
/// decision, taken atomically with the write, and makes the returned count
/// exact. Real values already stored are never replaced: they came from a
/// source that named this artist directly.
async fn apply(db: &Backend, artist: &RemoteArtist) -> anyhow::Result<bool> {
    let hash = rocksky_core::identity::artist_hash(&artist.name);
    let mut filled = false;

    if let Some(picture) = artist
        .picture
        .as_deref()
        .map(str::trim)
        .filter(|url| !url.is_empty())
    {
        let update = Query::update()
            .table(Artists::Table)
            .value(Artists::Picture, picture)
            .value(Artists::XataUpdatedat, db.now())
            .and_where(Expr::col(Artists::Sha256).eq(&hash))
            .cond_where(
                crate::sea_query::Cond::any()
                    .add(Expr::col(Artists::Picture).is_null())
                    .add(Expr::col(Artists::Picture).eq("")),
            )
            .to_owned();
        filled |= db.execute(&update).await? > 0;
    }

    if !artist.genres.is_empty() {
        let genres = serde_json::to_string(&artist.genres)?;
        let update = Query::update()
            .table(Artists::Table)
            .value(Artists::Genres, genres)
            .value(Artists::XataUpdatedat, db.now())
            .and_where(Expr::col(Artists::Sha256).eq(&hash))
            .cond_where(
                crate::sea_query::Cond::any()
                    .add(Expr::col(Artists::Genres).is_null())
                    .add(Expr::col(Artists::Genres).eq(""))
                    .add(Expr::col(Artists::Genres).eq("[]")),
            )
            .to_owned();
        filled |= db.execute(&update).await? > 0;
    }

    Ok(filled)
}

/// Artists missing a picture or genres, oldest first, from `offset`.
///
/// Oldest first so a long backfill is worked through in arrival order; the
/// offset is what stops a pass re-reading rows it cannot fill — see
/// [`super::Cursor`].
async fn incomplete(db: &Backend, limit: i64, offset: u64) -> Result<Vec<String>, sqlx::Error> {
    let missing_picture = Expr::col(Artists::Picture)
        .is_null()
        .or(Expr::col(Artists::Picture).eq(""));
    let missing_genres = Expr::col(Artists::Genres)
        .is_null()
        .or(Expr::col(Artists::Genres).eq(""))
        // An empty JSON array is how a "no genres" answer is stored, and it is
        // as unhelpful as a NULL to anything rendering tags.
        .or(Expr::col(Artists::Genres).eq("[]"));

    let query = Query::select()
        .column(Artists::Name)
        .from(Artists::Table)
        .and_where(missing_picture.or(missing_genres))
        // "Various Artists" is a compilation credit rather than an artist, so
        // nobody has a picture for it and asking is a wasted slot in a
        // rate-limited batch.
        .and_where(Expr::col(Artists::Name).ne("Various Artists"))
        .order_by(Artists::XataCreatedat, Order::Asc)
        .limit(limit as u64)
        .offset(offset)
        .to_owned();

    db.fetch_scalars::<String>(&query).await
}

/// How many artists are still incomplete, for the startup log.
pub async fn pending_count(db: &Backend) -> Result<i64, sqlx::Error> {
    let query = Query::select()
        .expr(db.cast_int(crate::sea_query::Func::count(Expr::col(Artists::XataId))))
        .from(Artists::Table)
        .and_where(
            Expr::col(Artists::Picture)
                .is_null()
                .or(Expr::col(Artists::Picture).eq("")),
        )
        .to_owned();
    db.count(&query).await
}

/// Marks a name as *asked about*, for [`UNKNOWN_TTL`].
///
/// Deliberately not "unknown". Marking only the names the API did not return
/// looks equivalent and is not: the API answers `genres: []` for almost every
/// artist, and an empty list cannot fill the column, so an artist answered
/// *with a picture* stays in the candidate set — [`incomplete`] selects on
/// missing picture **or** missing genres. The sweep then re-asks the same
/// fifty rows at the head of the table on every pass, forever, and never
/// reaches the rest.
///
/// So the marker records that a name has been asked, whatever came back. Each
/// pass then moves on, and the sweep walks the whole table. A name is retried
/// after the TTL, which is what picks up an artist whose picture the hosted
/// instance gains later.
fn asked_key(name: &str) -> String {
    format!("artist-asked:{}", name.to_lowercase())
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn seeded() -> Backend {
        let db = crate::db::connect_in_memory().await.unwrap();
        for (name, picture, genres) in [
            ("Needs Everything", None, None),
            ("Needs A Picture", None, Some(r#"["rock"]"#)),
            ("Needs Genres", Some("https://cdn/pic.jpg"), Some("[]")),
            (
                "Complete",
                Some("https://cdn/pic.jpg"),
                Some(r#"["house"]"#),
            ),
            // A compilation credit, not an artist.
            ("Various Artists", None, None),
        ] {
            let insert = Query::insert()
                .into_table(Artists::Table)
                .columns([
                    Artists::XataId,
                    Artists::Name,
                    Artists::Sha256,
                    Artists::Picture,
                    Artists::Genres,
                ])
                .values_panic([
                    crate::db::new_id().into(),
                    name.into(),
                    rocksky_core::identity::artist_hash(name).into(),
                    picture.into(),
                    genres.into(),
                ])
                .to_owned();
            db.execute(&insert).await.unwrap();
        }
        db
    }

    /// The selection decides how many rate-limited requests are spent, so it
    /// must not include rows that are already complete.
    #[tokio::test]
    async fn only_incomplete_artists_are_asked_about() {
        let db = seeded().await;
        let mut names = incomplete(&db, 50, 0).await.unwrap();
        names.sort();

        assert_eq!(
            names,
            vec![
                "Needs A Picture".to_string(),
                "Needs Everything".to_string(),
                "Needs Genres".to_string(),
            ]
        );

        // An empty JSON array counts as missing, and "Various Artists" is
        // never asked about.
        assert!(!names.contains(&"Complete".to_string()));
        assert!(!names.contains(&"Various Artists".to_string()));
    }

    /// The whole point: a picture and genres land on the right row.
    #[tokio::test]
    async fn a_response_fills_the_gaps() {
        let db = seeded().await;

        let updated = apply(
            &db,
            &RemoteArtist {
                name: "Needs Everything".into(),
                picture: Some("https://cdn/new.jpg".into()),
                genres: vec!["metalcore".into(), "metal".into()],
            },
        )
        .await
        .unwrap();
        assert!(updated);

        let row = stored(&db, "Needs Everything").await;
        assert_eq!(row.0.as_deref(), Some("https://cdn/new.jpg"));
        assert_eq!(row.1.as_deref(), Some(r#"["metalcore","metal"]"#));
    }

    /// A picture this instance already has came from a record naming the
    /// artist directly, so the hosted one must not replace it.
    #[tokio::test]
    async fn an_existing_picture_is_kept() {
        let db = seeded().await;

        apply(
            &db,
            &RemoteArtist {
                name: "Needs Genres".into(),
                picture: Some("https://cdn/remote.jpg".into()),
                genres: vec!["house".into()],
            },
        )
        .await
        .unwrap();

        let row = stored(&db, "Needs Genres").await;
        assert_eq!(
            row.0.as_deref(),
            Some("https://cdn/pic.jpg"),
            "the local picture was overwritten"
        );
        // …but the genres, which were an empty array, *are* filled. An empty
        // array is what `incomplete` selects on, so leaving it — which is
        // what `COALESCE(genres, …)` did, since `'[]'` is not NULL — meant a
        // row that could never stop being a candidate.
        assert_eq!(row.1.as_deref(), Some(r#"["house"]"#));
    }

    /// An answer with neither field is not a write.
    #[tokio::test]
    async fn an_empty_answer_changes_nothing() {
        let db = seeded().await;
        let updated = apply(
            &db,
            &RemoteArtist {
                name: "Needs Everything".into(),
                picture: None,
                genres: Vec::new(),
            },
        )
        .await
        .unwrap();
        assert!(!updated);

        // And an empty string is not a picture.
        let updated = apply(
            &db,
            &RemoteArtist {
                name: "Needs Everything".into(),
                picture: Some("  ".into()),
                genres: Vec::new(),
            },
        )
        .await
        .unwrap();
        assert!(!updated);
    }

    /// Matching is on the content hash, so the API's spelling of a name does
    /// not have to be byte-identical to this instance's.
    #[tokio::test]
    async fn matching_is_by_content_hash() {
        let db = seeded().await;

        apply(
            &db,
            &RemoteArtist {
                // Different case; the hash lowercases.
                name: "needs everything".into(),
                picture: Some("https://cdn/cased.jpg".into()),
                genres: Vec::new(),
            },
        )
        .await
        .unwrap();

        let row = stored(&db, "Needs Everything").await;
        assert_eq!(row.0.as_deref(), Some("https://cdn/cased.jpg"));
    }

    /// An artist answered with a picture but no genres stays a *candidate* —
    /// `incomplete` selects on missing picture OR missing genres, and the API
    /// answers `genres: []` for almost everyone, which cannot fill the column.
    ///
    /// So the only thing stopping the sweep re-asking the same head of the
    /// table forever is that the marker means "asked", not "not found". This
    /// pins that: the sweep spent every request on fifty already-filled rows
    /// and never reached the rest of the table.
    #[tokio::test]
    async fn a_filled_picture_without_genres_is_not_asked_about_again() {
        let db = seeded().await;

        // What the API actually answers: a picture, and no genres at all.
        let answer = RemoteArtist {
            name: "Needs Everything".into(),
            picture: Some("https://cdn/pic.jpg".into()),
            genres: Vec::new(),
        };
        assert!(apply(&db, &answer).await.unwrap(), "the picture is written");

        // The picture is there…
        assert_eq!(
            stored(&db, "Needs Everything").await.0.as_deref(),
            Some("https://cdn/pic.jpg")
        );
        // …and yet it is still selected, because its genres are still empty.
        assert!(
            incomplete(&db, 50, 0)
                .await
                .unwrap()
                .contains(&"Needs Everything".to_string()),
            "still a candidate, which is why the marker cannot mean 'not found'"
        );

        // Writing the same answer again fills nothing, so a sweep that kept
        // re-asking would report progress while making none.
        assert!(
            !apply(&db, &answer).await.unwrap(),
            "nothing left to fill, so nothing is counted"
        );
    }

    /// The marker is keyed on the name case-insensitively, since that is how
    /// the rows are hashed — otherwise "Skrillex" and "skrillex" would each
    /// spend a request.
    #[test]
    fn the_asked_marker_ignores_case() {
        assert_eq!(asked_key("Boards of Canada"), asked_key("boards of canada"));
        assert_ne!(asked_key("Skrillex"), asked_key("Sia"));
    }

    /// An empty string is not a picture, and `COALESCE` would have kept it.
    #[tokio::test]
    async fn an_empty_string_picture_is_still_a_gap() {
        let db = crate::db::connect_in_memory().await.unwrap();
        let insert = Query::insert()
            .into_table(Artists::Table)
            .columns([
                Artists::XataId,
                Artists::Name,
                Artists::Sha256,
                Artists::Picture,
            ])
            .values_panic([
                crate::db::new_id().into(),
                "Blank".into(),
                rocksky_core::identity::artist_hash("Blank").into(),
                "".into(),
            ])
            .to_owned();
        db.execute(&insert).await.unwrap();

        assert!(apply(
            &db,
            &RemoteArtist {
                name: "Blank".into(),
                picture: Some("https://cdn/real.jpg".into()),
                genres: Vec::new(),
            }
        )
        .await
        .unwrap());

        assert_eq!(
            stored(&db, "Blank").await.0.as_deref(),
            Some("https://cdn/real.jpg")
        );
    }

    async fn stored(db: &Backend, name: &str) -> (Option<String>, Option<String>) {
        let query = Query::select()
            .columns([Artists::Picture, Artists::Genres])
            .from(Artists::Table)
            .and_where(Expr::col(Artists::Name).eq(name))
            .to_owned();
        db.fetch_optional::<(Option<String>, Option<String>)>(&query)
            .await
            .unwrap()
            .expect("the artist exists")
    }
}
