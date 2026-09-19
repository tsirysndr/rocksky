//! The analytics service (`crates/analytics`), when one is configured.
//!
//! # Why an instance would want this
//!
//! The listening aggregates — a listener's top artists, their top tracks, the
//! scrobbles-per-day chart — are `GROUP BY` over the whole of `scrobbles`.
//! Against a hosted Postgres that is a network-bound sequential read: the
//! global top-artists chart measured 26 seconds here, over 20 of them spent
//! waiting on I/O for 1.6M rows.
//!
//! The analytics service answers the same questions from a local columnar
//! DuckDB snapshot, kept current from the event stream. The SQL is not
//! cleverer — it is nearly identical — it is fast because the data is local
//! and column-oriented. `apps/api` has always routed these calls to it, which
//! is the whole reason the TypeScript API is quick on pages this binary is
//! slow on.
//!
//! # Routing matches `apps/api` exactly
//!
//! Only the calls `apps/api` sends are sent, so the two APIs answer the same
//! page from the same source:
//!
//! | This endpoint                          | Analytics method             |
//! |----------------------------------------|------------------------------|
//! | `charts.getScrobblesChart`             | `library.getScrobblesPerDay` |
//! | …`?artisturi=`                         | `library.getArtistScrobbles` |
//! | …`?albumuri=`                          | `library.getAlbumScrobbles`  |
//! | …`?songuri=`                           | `library.getTrackScrobbles`  |
//! | `actor.getActorArtists`                | `library.getTopArtists`      |
//! | `actor.getActorSongs`                  | `library.getTopTracks`       |
//! | `actor.getActorAlbums`                 | `library.getTopAlbums`       |
//! | `stats.getStats`                       | `library.getStats`           |
//!
//! `charts.getTopArtists`, `charts.getTopTracks`, `getTopScrobblers` and
//! `getDecades` stay on the database, because `apps/api` serves those from
//! the database too — and the global charts there rank by *distinct
//! listeners*, where analytics ranks by play count. Routing them would
//! silently reorder the homepage.
//!
//! # Unset means unset, not broken
//!
//! Every function here answers `None` when `analytics_url` is absent, and the
//! caller runs its own query. That is the default: a self-hosted instance
//! against SQLite has its data on local disk, which is the situation analytics
//! exists to recreate, so it gains nothing from running a second service.
//!
//! A configured service that fails answers `None` as well, and the caller
//! falls back the same way. Slow beats empty on a page someone is looking at.

use std::time::Duration;

use chrono::NaiveDateTime;
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};

use crate::state::AppState;

/// Long enough for a cold DuckDB to answer, short enough that an unhealthy
/// service does not hold a request open.
///
/// A timeout is not free: the fallback query still has to run afterwards, so
/// this is added to an already slow page rather than replacing it. `apps/ws`
/// allows 120 seconds; that only makes sense where there is no fallback to
/// wait for.
const TIMEOUT: Duration = Duration::from_secs(10);

// ------------------------------------------------------------ the transport

/// Whether calls will go anywhere. Lets a caller skip building a request body
/// it is about to throw away.
pub fn configured(state: &AppState) -> bool {
    state.config().analytics_url.is_some()
}

/// POSTs one method and reads its answer, or `None` if anything at all went
/// wrong — including the service not being configured.
///
/// The service dispatches on the path (`POST /library.getTopArtists`) with the
/// parameters as a JSON body, which is the shape `apps/api`'s axios client
/// has always used.
async fn call<B, T>(state: &AppState, method: &str, body: &B) -> Option<T>
where
    B: Serialize,
    T: DeserializeOwned,
{
    let base = state
        .config()
        .analytics_url
        .as_deref()?
        .trim_end_matches('/');

    let response = state
        .http()
        .post(format!("{base}/{method}"))
        .json(body)
        .timeout(TIMEOUT)
        .send()
        .await;

    let response = match response {
        Ok(response) if response.status().is_success() => response,
        Ok(response) => {
            tracing::warn!(status = %response.status(), method, "analytics refused the call");
            return None;
        }
        Err(err) => {
            tracing::warn!(error = %err, method, "analytics unreachable, querying the database");
            return None;
        }
    };

    match response.json::<T>().await {
        Ok(body) => Some(body),
        Err(err) => {
            tracing::warn!(error = %err, method, "analytics answered an unreadable body");
            None
        }
    }
}

/// A bound DuckDB will parse, from whatever spelling reached the query string.
///
/// The service binds these as strings and lets DuckDB cast (`created_at
/// BETWEEN ? AND ?`, `CAST(? AS TIMESTAMP)`), so the format has to be one it
/// accepts: `YYYY-MM-DD HH:MM:SS`. A trailing `Z` is dropped rather than
/// passed through — the column is a naive `TIMESTAMP`, and everything in it is
/// already UTC.
///
/// `time` fills in a bare date. It matters which end it is: an end bound of
/// `2026-09-19 00:00:00` excludes the whole of the 19th, which on the default
/// range is *today* — the chart would lose the day someone is watching fill up.
fn bound(raw: &str, time: &str) -> String {
    let raw = raw.trim().trim_end_matches('Z').replace('T', " ");
    if raw.len() == 10 {
        format!("{raw} {time}")
    } else {
        raw
    }
}

/// The start of the day `raw` names.
pub fn start_of(raw: &str) -> String {
    bound(raw, "00:00:00")
}

/// The last instant of the day `raw` names.
pub fn end_of(raw: &str) -> String {
    bound(raw, "23:59:59.999")
}

// ------------------------------------------------------------- what is sent

#[derive(Debug, Clone, Copy, Serialize)]
struct Pagination {
    skip: i64,
    take: i64,
}

#[derive(Debug, Serialize)]
struct PerDayParams<'a> {
    #[serde(skip_serializing_if = "Option::is_none")]
    user_did: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    genre: Option<&'a str>,
    start: String,
    end: String,
}

/// The three by-entity charts differ only in the name of the id field, which
/// is why they are three methods rather than one.
#[derive(Debug, Serialize)]
struct EntityParams<'a> {
    #[serde(rename = "artist_id", skip_serializing_if = "Option::is_none")]
    artist: Option<&'a str>,
    #[serde(rename = "album_id", skip_serializing_if = "Option::is_none")]
    album: Option<&'a str>,
    #[serde(rename = "track_id", skip_serializing_if = "Option::is_none")]
    track: Option<&'a str>,
    start: String,
    end: String,
}

#[derive(Debug, Serialize)]
struct TopParams<'a> {
    #[serde(skip_serializing_if = "Option::is_none")]
    user_did: Option<&'a str>,
    pagination: Pagination,
    #[serde(skip_serializing_if = "Option::is_none")]
    start_date: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    end_date: Option<String>,
}

#[derive(Debug, Serialize)]
struct StatsParams<'a> {
    user_did: &'a str,
}

// -------------------------------------------------------- what comes back

/// Every optional field carries `default` because the service omits nulls
/// (`skip_serializing_if`), so an absent key is the normal case rather than a
/// malformed answer.
#[derive(Debug, Clone, Deserialize)]
pub struct DayCount {
    /// `YYYY-MM-DD`, the same spelling the database path produces.
    pub date: String,
    #[serde(default)]
    pub count: i64,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct Artist {
    pub id: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub picture: Option<String>,
    #[serde(default)]
    pub sha256: String,
    #[serde(default)]
    pub uri: Option<String>,
    #[serde(default)]
    pub play_count: i64,
    #[serde(default)]
    pub unique_listeners: i64,
    #[serde(default)]
    pub genres: Option<Vec<String>>,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct Track {
    pub id: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub artist: String,
    #[serde(default)]
    pub album_artist: String,
    #[serde(default)]
    pub album: String,
    #[serde(default)]
    pub album_art: Option<String>,
    #[serde(default)]
    pub uri: Option<String>,
    #[serde(default)]
    pub artist_uri: Option<String>,
    #[serde(default)]
    pub album_uri: Option<String>,
    #[serde(default)]
    pub duration: i64,
    #[serde(default)]
    pub track_number: Option<i64>,
    #[serde(default)]
    pub disc_number: Option<i64>,
    #[serde(default)]
    pub sha256: String,
    /// Not selected by `getTopTracks`, so in practice always absent there —
    /// which is why `apps/api` answers those with `tags: []`.
    #[serde(default)]
    pub genre: Option<String>,
    #[serde(default)]
    pub created_at: Option<NaiveDateTime>,
    #[serde(default)]
    pub play_count: i64,
    #[serde(default)]
    pub unique_listeners: i64,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct Album {
    pub id: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub artist: String,
    #[serde(default)]
    pub album_art: Option<String>,
    #[serde(default)]
    pub uri: Option<String>,
    #[serde(default)]
    pub artist_uri: Option<String>,
    #[serde(default)]
    pub sha256: String,
    #[serde(default)]
    pub year: Option<i64>,
    #[serde(default)]
    pub release_date: Option<String>,
    #[serde(default)]
    pub play_count: i64,
    #[serde(default)]
    pub unique_listeners: i64,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct Stats {
    #[serde(default)]
    pub scrobbles: i64,
    #[serde(default)]
    pub artists: i64,
    #[serde(default)]
    pub loved_tracks: i64,
    #[serde(default)]
    pub albums: i64,
    #[serde(default)]
    pub tracks: i64,
}

// -------------------------------------------------------------- the methods

/// Scrobbles per day, for one listener, one genre, or everyone.
///
/// `apps/api` sends no range and takes the service's own 30-day default; the
/// range is sent here so an explicit `from`/`to` is honoured and the default
/// stays the six months this API has always answered with.
pub async fn scrobbles_per_day(
    state: &AppState,
    user_did: Option<&str>,
    genre: Option<&str>,
    from: &str,
    to: &str,
) -> Option<Vec<DayCount>> {
    let params = PerDayParams {
        user_did,
        genre,
        start: start_of(from),
        end: end_of(to),
    };
    call(state, "library.getScrobblesPerDay", &params).await
}

/// One artist's, album's or track's daily counts.
///
/// The service matches `id = ? OR uri = ?`, so an AT-URI can be passed
/// straight through — no lookup first, unlike the database path which needs
/// the row id to filter on.
pub async fn artist_scrobbles(
    state: &AppState,
    artist: &str,
    from: &str,
    to: &str,
) -> Option<Vec<DayCount>> {
    let params = EntityParams {
        artist: Some(artist),
        album: None,
        track: None,
        start: start_of(from),
        end: end_of(to),
    };
    call(state, "library.getArtistScrobbles", &params).await
}

pub async fn album_scrobbles(
    state: &AppState,
    album: &str,
    from: &str,
    to: &str,
) -> Option<Vec<DayCount>> {
    let params = EntityParams {
        artist: None,
        album: Some(album),
        track: None,
        start: start_of(from),
        end: end_of(to),
    };
    call(state, "library.getAlbumScrobbles", &params).await
}

pub async fn track_scrobbles(
    state: &AppState,
    track: &str,
    from: &str,
    to: &str,
) -> Option<Vec<DayCount>> {
    let params = EntityParams {
        artist: None,
        album: None,
        track: Some(track),
        start: start_of(from),
        end: end_of(to),
    };
    call(state, "library.getTrackScrobbles", &params).await
}

/// One listener's most-played artists, tracks and albums.
///
/// `user_did` takes a handle as well — the service matches `u.did = ? OR
/// u.handle = ?`, the same either-or this API accepts in `did`.
pub async fn top_artists(
    state: &AppState,
    user_did: Option<&str>,
    limit: i64,
    offset: i64,
    start_date: Option<&str>,
    end_date: Option<&str>,
) -> Option<Vec<Artist>> {
    call(
        state,
        "library.getTopArtists",
        &top_params(user_did, limit, offset, start_date, end_date),
    )
    .await
}

pub async fn top_tracks(
    state: &AppState,
    user_did: Option<&str>,
    limit: i64,
    offset: i64,
    start_date: Option<&str>,
    end_date: Option<&str>,
) -> Option<Vec<Track>> {
    call(
        state,
        "library.getTopTracks",
        &top_params(user_did, limit, offset, start_date, end_date),
    )
    .await
}

pub async fn top_albums(
    state: &AppState,
    user_did: Option<&str>,
    limit: i64,
    offset: i64,
    start_date: Option<&str>,
    end_date: Option<&str>,
) -> Option<Vec<Album>> {
    call(
        state,
        "library.getTopAlbums",
        &top_params(user_did, limit, offset, start_date, end_date),
    )
    .await
}

fn top_params<'a>(
    user_did: Option<&'a str>,
    limit: i64,
    offset: i64,
    start_date: Option<&str>,
    end_date: Option<&str>,
) -> TopParams<'a> {
    TopParams {
        user_did,
        pagination: Pagination {
            skip: offset,
            take: limit,
        },
        start_date: start_date.map(start_of),
        end_date: end_date.map(end_of),
    }
}

/// One listener's totals.
pub async fn stats(state: &AppState, user_did: &str) -> Option<Stats> {
    call(state, "library.getStats", &StatsParams { user_did }).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_bare_date_is_filled_in_at_the_end_it_bounds() {
        assert_eq!(start_of("2026-09-19"), "2026-09-19 00:00:00");
        assert_eq!(end_of("2026-09-19"), "2026-09-19 23:59:59.999");
    }

    /// Losing the last day of the range is the bug this guards: an end bound
    /// at midnight drops everything scrobbled that day, and on the default
    /// range the last day is today.
    #[test]
    fn an_end_bound_covers_the_whole_of_its_day() {
        assert!(end_of("2026-09-19").as_str() > "2026-09-19 23:00:00");
        assert!(end_of("2026-09-19").as_str() < "2026-09-20 00:00:00");
    }

    /// The query string carries whatever the web UI had — often a full
    /// JavaScript ISO string. DuckDB parses neither the `T` nor the `Z`
    /// reliably into a naive `TIMESTAMP`, so both are removed.
    #[test]
    fn an_iso_instant_is_rewritten_for_duckdb() {
        assert_eq!(
            start_of("2026-09-19T14:03:00.000Z"),
            "2026-09-19 14:03:00.000"
        );
        assert_eq!(end_of("2026-09-19T14:03:00Z"), "2026-09-19 14:03:00");
    }

    /// An already-plain bound passes through untouched, whichever end it is.
    #[test]
    fn a_full_timestamp_is_left_alone() {
        assert_eq!(start_of("2026-09-19 14:03:00"), "2026-09-19 14:03:00");
        assert_eq!(end_of("2026-09-19 14:03:00"), "2026-09-19 14:03:00");
    }

    /// The service omits every null, so the answer a listener with no links
    /// produces must still deserialize.
    #[test]
    fn omitted_optional_fields_deserialize() {
        let artist: Artist =
            serde_json::from_str(r#"{"id":"a","name":"Boards of Canada","sha256":"s"}"#).unwrap();
        assert_eq!(artist.play_count, 0);
        assert!(artist.uri.is_none());
        assert!(artist.genres.is_none());

        let track: Track =
            serde_json::from_str(r#"{"id":"t","title":"Roygbiv","sha256":"s"}"#).unwrap();
        assert_eq!(track.duration, 0);
        assert!(track.created_at.is_none());

        let album: Album =
            serde_json::from_str(r#"{"id":"al","title":"MHTRTC","sha256":"s"}"#).unwrap();
        assert!(album.year.is_none());
    }

    /// The timestamp the service sends is naive, not RFC 3339.
    #[test]
    fn a_naive_created_at_parses() {
        let track: Track =
            serde_json::from_str(r#"{"id":"t","created_at":"2026-09-19T14:03:00"}"#).unwrap();
        assert_eq!(
            track.created_at.unwrap().and_utc().to_rfc3339(),
            "2026-09-19T14:03:00+00:00"
        );
    }

    /// Only the id that was asked for is sent, so the service's
    /// `deny_unknown_fields`-free parameter structs never see a stray key.
    #[test]
    fn an_entity_chart_sends_one_id() {
        let params = EntityParams {
            artist: None,
            album: None,
            track: Some("at://did:plc:a/app.rocksky.song/1"),
            start: start_of("2026-01-01"),
            end: end_of("2026-09-19"),
        };
        let body = serde_json::to_value(&params).unwrap();
        assert_eq!(body["track_id"], "at://did:plc:a/app.rocksky.song/1");
        assert!(body.get("artist_id").is_none());
        assert!(body.get("album_id").is_none());
    }

    /// Pagination is nested, which is the shape `apps/api` posts.
    #[test]
    fn top_params_nest_pagination() {
        let body = serde_json::to_value(top_params(Some("did:plc:a"), 10, 20, None, None)).unwrap();
        assert_eq!(body["user_did"], "did:plc:a");
        assert_eq!(body["pagination"]["take"], 10);
        assert_eq!(body["pagination"]["skip"], 20);
        assert!(body.get("start_date").is_none());
    }

    /// No `user_did` means the global chart, and the key must be absent
    /// rather than null — the service switches on `Option::is_some`.
    #[test]
    fn a_global_top_omits_the_listener() {
        let body = serde_json::to_value(top_params(None, 50, 0, None, None)).unwrap();
        assert!(body.get("user_did").is_none());
    }

    /// Answers recorded from a running `rockskyd analytics serve`, verbatim.
    ///
    /// Hand-written fixtures would only assert what this file already
    /// believes. These were captured by posting the bodies above at the real
    /// binary over a DuckDB holding two scrobbles, so they fail if the service
    /// renames a field, changes a type, or stops sending one.
    mod recorded {
        use super::*;

        #[test]
        fn scrobbles_per_day() {
            let days: Vec<DayCount> = serde_json::from_str(
                r#"[{"date":"2026-09-18","count":1},{"date":"2026-09-19","count":1}]"#,
            )
            .unwrap();
            assert_eq!(days.len(), 2);
            // The same `YYYY-MM-DD` the database path produces, so the two
            // sources are interchangeable to the client.
            assert_eq!(days[0].date, "2026-09-18");
            assert_eq!(days[1].count, 1);
        }

        #[test]
        fn top_artists() {
            let artists: Vec<Artist> = serde_json::from_str(
                r#"[{"id":"ar1","name":"Boards of Canada","sha256":"sha-ar1","uri":"at://did:plc:svc/app.rocksky.artist/boc","play_count":2,"unique_listeners":1,"genres":["electronic","ambient"]}]"#,
            )
            .unwrap();
            let artist = &artists[0];
            assert_eq!(artist.name, "Boards of Canada");
            assert_eq!(artist.play_count, 2);
            assert_eq!(artist.unique_listeners, 1);
            assert_eq!(
                artist.genres.as_deref(),
                Some(["electronic".to_string(), "ambient".to_string()].as_slice())
            );
            // `picture` was not sent at all — the service omits its nulls.
            assert!(artist.picture.is_none());
        }

        #[test]
        fn top_tracks() {
            let tracks: Vec<Track> = serde_json::from_str(
                r#"[{"id":"t1","title":"Roygbiv","artist":"Boards of Canada","album_artist":"Boards of Canada","album_art":"http://a/art.jpg","album":"Geogaddi","track_number":4,"duration":1000,"sha256":"sha-t1","disc_number":1,"uri":"at://did:plc:a/app.rocksky.song/1","artist_uri":"at://did:plc:svc/app.rocksky.artist/boc","album_uri":"at://did:plc:a/app.rocksky.album/1","created_at":"2026-09-18T10:00:00","play_count":2,"unique_listeners":1}]"#,
            )
            .unwrap();
            let track = &tracks[0];
            assert_eq!(track.title, "Roygbiv");
            assert_eq!(track.duration, 1000);
            assert_eq!(track.track_number, Some(4));
            assert_eq!(track.play_count, 2);
            // Naive, with no offset — the reason `created_at` is a
            // `NaiveDateTime` here and not a `DateTime<Utc>`.
            assert_eq!(
                track.created_at.unwrap().and_utc().to_rfc3339(),
                "2026-09-18T10:00:00+00:00"
            );
            // `getTopTracks` does not select the genre, so a story or chart
            // built from this carries no tags.
            assert!(track.genre.is_none());
        }

        #[test]
        fn top_albums() {
            let albums: Vec<Album> = serde_json::from_str(
                r#"[{"id":"al1","title":"Geogaddi","artist":"Boards of Canada","release_date":"2002-02-18","album_art":"http://a/art.jpg","year":2002,"sha256":"sha-al1","uri":"at://did:plc:a/app.rocksky.album/1","artist_uri":"at://did:plc:svc/app.rocksky.artist/boc","play_count":2,"unique_listeners":1}]"#,
            )
            .unwrap();
            let album = &albums[0];
            assert_eq!(album.title, "Geogaddi");
            assert_eq!(album.year, Some(2002));
            assert_eq!(album.release_date.as_deref(), Some("2002-02-18"));
            assert_eq!(album.unique_listeners, 1);
        }

        /// The one method that answers an object rather than a list, and whose
        /// keys are snake_case where the view's are not.
        #[test]
        fn stats() {
            let stats: Stats = serde_json::from_str(
                r#"{"albums":1,"artists":1,"loved_tracks":0,"scrobbles":2,"tracks":0}"#,
            )
            .unwrap();
            assert_eq!(stats.scrobbles, 2);
            assert_eq!(stats.albums, 1);
            assert_eq!(stats.loved_tracks, 0);
        }
    }
}
