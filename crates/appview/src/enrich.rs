//! Filling in artist pictures and genres from `api.rocksky.app`.
//!
//! A scrobble record carries the track's metadata but nothing about the
//! artist, so an artist created from the firehose has a name and nothing else.
//! The hosted API has already resolved pictures and genres for most artists
//! anybody has scrobbled — from Spotify, from a Bluesky avatar — so a
//! self-hosted instance asks it rather than repeating that work against four
//! upstreams it has no credentials for.
//!
//! The endpoint and the field names are the ones `rockbox-zig` uses for the
//! same job (`crates/library/src/artists.rs`):
//!
//! ```text
//! GET /xrpc/app.rocksky.artist.getArtists?names=A,B,C
//! → { "artists": [ { "name": …, "picture": …, "genres": [ … ] } ] }
//! ```
//!
//! # The API is rate limited, so this is deliberately slow
//!
//! One request per batch, a long gap between batches, and a `429` backs off
//! rather than retrying immediately. Filling in ten thousand artists takes
//! hours, which is fine: an artist without a picture renders a placeholder,
//! not an error.
//!
//! Three things keep the request count down beyond that:
//!
//! | measure            | why                                                  |
//! |--------------------|------------------------------------------------------|
//! | batching by name   | fifty artists per request instead of fifty requests  |
//! | only missing rows  | an artist with a picture is never asked about again   |
//! | negative marking   | a name the API does not know is not re-asked for a week |
//!
//! Without the last one the sweep would ask about the same unknown artists on
//! every pass forever, since "no picture" is also the condition for selecting
//! them.
//!
//! # Names containing a comma
//!
//! The endpoint takes `names` as one comma-separated string, so a name like
//! "Earth, Wind & Fire" cannot be batched — it would arrive as two names and
//! match neither. Those go one per request instead of being silently
//! corrupted, which is what `rockbox-zig`'s straight `join(",")` does.

use crate::db::schema::Artists;
use crate::db::Backend;
use crate::sea_query::{Expr, Order, Query};
use crate::state::AppState;
use serde::Deserialize;
use std::time::Duration;

/// Where to ask. The hosted API, which has already done this work.
pub const DEFAULT_SOURCE: &str = "https://api.rocksky.app";

/// Gap between batches.
///
/// The API is rate limited and this is background work nobody is waiting on,
/// so the interval is generous rather than tuned.
const INTERVAL: Duration = Duration::from_secs(20);

/// How long to wait after a `429` or a server error.
const BACKOFF: Duration = Duration::from_secs(300);

/// Artists asked about per request.
///
/// Fifty names is a query string of a few kilobytes — comfortably inside any
/// URL limit, and fifty times fewer requests than asking one at a time.
const BATCH: i64 = 50;

/// How long a name the API did not recognise is left alone.
///
/// Long, because the answer rarely changes: an artist the hosted instance has
/// never seen either will not appear because this instance asked again. Not
/// permanent, because it does change when somebody scrobbles them there.
const UNKNOWN_TTL: Duration = Duration::from_secs(7 * 24 * 3600);

/// One request's worth of timeout.
const TIMEOUT: Duration = Duration::from_secs(15);

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

/// Starts the sweep. The handle stops it when dropped.
pub fn spawn(state: &AppState) -> tokio::task::JoinHandle<()> {
    let state = state.clone();
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(INTERVAL).await;

            match run_batch(&state).await {
                Ok(Outcome::Filled(0)) => {}
                Ok(Outcome::Filled(n)) => tracing::info!(artists = n, "filled in artist metadata"),
                Ok(Outcome::RateLimited) => {
                    tracing::warn!(
                        seconds = BACKOFF.as_secs(),
                        "rocksky API rate limited the metadata sweep; backing off"
                    );
                    tokio::time::sleep(BACKOFF).await;
                }
                Err(err) => {
                    tracing::warn!(error = ?err, "artist metadata sweep failed");
                    tokio::time::sleep(BACKOFF).await;
                }
            }
        }
    })
}

pub enum Outcome {
    /// How many rows were updated.
    Filled(usize),
    /// The API refused; the caller should wait.
    RateLimited,
}

/// Asks about one batch of artists and fills in what comes back.
pub async fn run_batch(state: &AppState) -> anyhow::Result<Outcome> {
    let source = state.config().artist_metadata_url.clone();
    if source.is_empty() {
        return Ok(Outcome::Filled(0));
    }

    // Asking ourselves would be a loop that answers with the same empty rows
    // it is trying to fill.
    if is_self(&source, state.config()) {
        tracing::debug!("artist metadata source is this instance; nothing to do");
        return Ok(Outcome::Filled(0));
    }

    let candidates = incomplete(state.db(), BATCH * 2).await?;
    if candidates.is_empty() {
        return Ok(Outcome::Filled(0));
    }

    // Names already asked about and not found are skipped without a request.
    let mut wanted = Vec::new();
    for name in candidates {
        if state.cache().get(&unknown_key(&name)).await.is_none() {
            wanted.push(name);
        }
        if wanted.len() as i64 >= BATCH {
            break;
        }
    }
    if wanted.is_empty() {
        return Ok(Outcome::Filled(0));
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

    // Anything asked about and not returned is marked, so the next pass does
    // not spend a slot on it again. Compared on the hash rather than the name,
    // because the API may spell it differently — and a difference in spelling
    // means it will never match on a later pass either.
    let returned: std::collections::HashSet<String> = found
        .iter()
        .map(|artist| rocksky_core::identity::artist_hash(&artist.name))
        .collect();

    for name in &asked {
        if !returned.contains(&rocksky_core::identity::artist_hash(name)) {
            state
                .cache()
                .set_ex(&unknown_key(name), UNKNOWN_TTL, "1")
                .await;
        }
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
async fn apply(db: &Backend, artist: &RemoteArtist) -> anyhow::Result<bool> {
    let picture = artist
        .picture
        .as_deref()
        .map(str::trim)
        .filter(|url| !url.is_empty());
    let genres = (!artist.genres.is_empty())
        .then(|| serde_json::to_string(&artist.genres))
        .transpose()?;

    if picture.is_none() && genres.is_none() {
        return Ok(false);
    }

    let hash = rocksky_core::identity::artist_hash(&artist.name);
    let mut update = Query::update();
    update.table(Artists::Table);

    // `COALESCE`, so a picture this instance already has — from an artist
    // record, say — is not replaced by the hosted one. Whatever is here came
    // from a source that named this artist directly.
    if let Some(picture) = picture {
        update.value(
            Artists::Picture,
            crate::sea_query::Func::coalesce([
                Expr::col(Artists::Picture).into(),
                Expr::val(picture).into(),
            ]),
        );
    }
    if let Some(genres) = genres {
        update.value(
            Artists::Genres,
            crate::sea_query::Func::coalesce([
                Expr::col(Artists::Genres).into(),
                Expr::val(genres).into(),
            ]),
        );
    }

    update
        .value(Artists::XataUpdatedat, crate::db::now_timestamp())
        .and_where(Expr::col(Artists::Sha256).eq(hash));

    Ok(db.execute(&update).await? > 0)
}

/// Artists missing a picture or genres, oldest first.
///
/// Oldest first so a long backfill is worked through in arrival order rather
/// than re-attempting the same head of the table.
async fn incomplete(db: &Backend, limit: i64) -> Result<Vec<String>, sqlx::Error> {
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

fn unknown_key(name: &str) -> String {
    format!("artist-unknown:{}", name.to_lowercase())
}

/// Whether the configured source is this instance.
fn is_self(source: &str, config: &crate::Config) -> bool {
    let normalise = |url: &str| url.trim_end_matches('/').to_lowercase();
    normalise(source) == normalise(&config.public_url)
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
        let mut names = incomplete(&db, 50).await.unwrap();
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
        // …but the genres, which were an empty array, are filled.
        assert_eq!(
            row.1.as_deref(),
            Some("[]"),
            "COALESCE keeps the empty array"
        );
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

    /// Asking ourselves would answer with the same empty rows we are trying
    /// to fill.
    #[test]
    fn this_instance_is_not_its_own_source() {
        let mut config = crate::Config::for_test();
        config.public_url = "https://rocksky.example".into();

        assert!(is_self("https://rocksky.example", &config));
        assert!(is_self("https://rocksky.example/", &config));
        assert!(is_self("HTTPS://Rocksky.Example", &config));
        assert!(!is_self(DEFAULT_SOURCE, &config));
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
