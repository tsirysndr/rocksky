//! `app.rocksky.scrobble.*`

use crate::auth::Auth;
use crate::db::models::{self, Artist, Scrobble, SCROBBLE_COLS};
use crate::db::query::Sql;
use crate::db::{loaders, Backend};
use crate::error::XrpcResult;
use crate::likes;
use crate::rsql::{self, Field, FieldMap};
use crate::state::AppState;
use crate::views::{FirstScrobbleView, ScrobbleViewBasic, ScrobbleViewDetailed};
use crate::xrpc::{clamp_limit, clamp_offset, json};
use crate::xrpc_query;
use actix_web::web::{self, ServiceConfig};
use actix_web::HttpResponse;
use serde::{Deserialize, Serialize};
use std::time::Duration;

pub fn configure(cfg: &mut ServiceConfig) {
    xrpc_query!(cfg, "app.rocksky.scrobble.getScrobbles", get_scrobbles);
    xrpc_query!(cfg, "app.rocksky.scrobble.getScrobble", get_scrobble);
}

/// How long a rendered feed page stays cached, matching `SCROBBLES_CACHE_TTL`
/// in the TypeScript handler.
const SCROBBLES_CACHE_TTL: Duration = Duration::from_secs(30);

/// Bumped by the indexer when a scrobble lands, which invalidates every cached
/// page at once without having to enumerate them.
pub const SCROBBLES_VERSION_KEY: &str = "scrobbles:ver";

/// The selectors `getScrobbles` exposes to `?filter=`. Anything absent here is
/// rejected, so a filter can never reach an unexposed column or table.
const FILTER_FIELDS: FieldMap = &[
    ("uri", Field::text("s.uri")),
    ("date", Field::date("s.timestamp")),
    ("timestamp", Field::date("s.timestamp")),
    ("title", Field::text("t.title")),
    ("artist", Field::text("t.artist")),
    ("album", Field::text("t.album")),
    ("track.title", Field::text("t.title")),
    ("track.artist", Field::text("t.artist")),
    ("track.album", Field::text("t.album")),
    ("track.albumArtist", Field::text("t.album_artist")),
    ("track.genre", Field::text("t.genre")),
    ("track.duration", Field::number("t.duration")),
    ("track.isrc", Field::text("t.isrc")),
    ("track.mbId", Field::text("t.mb_id")),
    ("user.did", Field::text("u.did")),
    ("user.handle", Field::text("u.handle")),
    ("user.displayName", Field::text("u.display_name")),
    ("artist.name", Field::text("a.name")),
    ("artist.genres", Field::array("a.genres")),
];

/// The joins the filter selectors above reference. Always present, so a filter
/// on any exposed field resolves.
const FEED_JOINS: &str = " FROM scrobbles s \
     LEFT JOIN tracks t ON t.xata_id = s.track_id \
     LEFT JOIN users u ON u.xata_id = s.user_id \
     LEFT JOIN artists a ON a.xata_id = s.artist_id";

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetScrobblesParams {
    #[serde(default)]
    pub did: Option<String>,
    #[serde(default)]
    pub filter: Option<String>,
    #[serde(default)]
    pub following: Option<bool>,
    #[serde(default)]
    pub limit: Option<i64>,
    #[serde(default)]
    pub offset: Option<i64>,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct ScrobblesOutput {
    pub scrobbles: Vec<ScrobbleViewBasic>,
}

/// `app.rocksky.scrobble.getScrobbles`
///
/// The TypeScript handler wraps the pipeline in `Effect.catchAll` and answers
/// `{ scrobbles: [] }` on any failure, so a transient database problem shows an
/// empty feed rather than an error. That is reproduced here — except for a bad
/// `filter`, which is validated first and answers 400, because silently
/// returning nothing for a malformed query is far harder to debug.
async fn get_scrobbles(
    state: web::Data<AppState>,
    params: web::Query<GetScrobblesParams>,
    auth: Auth,
) -> XrpcResult<HttpResponse> {
    let params = params.into_inner();
    let filter = rsql::compile_param(params.filter.as_deref(), FILTER_FIELDS, state.dialect())?;

    let key = cache_key(&params, state.cache().get(SCROBBLES_VERSION_KEY).await);
    if let Some(cached) = state.cache().get_json::<ScrobblesOutput>(&key).await {
        return json(cached);
    }

    let output = match load_scrobbles(&state, &params, filter, auth.did()).await {
        Ok(output) => output,
        Err(err) => {
            tracing::error!(error = ?err, "error retrieving scrobbles");
            return json(ScrobblesOutput::default());
        }
    };

    state
        .cache()
        .set_json(&key, SCROBBLES_CACHE_TTL, &output)
        .await;
    json(output)
}

/// Mirrors the TypeScript `cacheKey`, including the version prefix.
fn cache_key(params: &GetScrobblesParams, version: Option<String>) -> String {
    format!(
        "scrobbles:getScrobbles:v2:{}:{}:{}:{}:{}:{}",
        version.unwrap_or_else(|| "0".into()),
        params.did.as_deref().unwrap_or("anon"),
        if params.following == Some(true) {
            "1"
        } else {
            "0"
        },
        params.limit.map(|v| v.to_string()).unwrap_or_default(),
        params.offset.map(|v| v.to_string()).unwrap_or_default(),
        params.filter.as_deref().unwrap_or(""),
    )
}

async fn load_scrobbles(
    state: &AppState,
    params: &GetScrobblesParams,
    filter: Option<Sql>,
    viewer: Option<&str>,
) -> anyhow::Result<ScrobblesOutput> {
    let db = state.db();

    // `following` restricts the feed to the accounts `did` follows. An empty
    // follow list means an empty feed, not an unfiltered one.
    let follow_ids = match (params.did.as_deref(), params.following) {
        (Some(did), Some(true)) => Some(following_user_ids(db, did).await?),
        _ => None,
    };
    if follow_ids.as_ref().is_some_and(|ids| ids.is_empty()) {
        return Ok(ScrobblesOutput::default());
    }

    // Only the scrobble columns are selected; the joins exist for filtering.
    // Selecting the joined tables too would produce four columns aliased `id`.
    let mut sql = db.sql("SELECT ");
    sql.push(models::select_list(SCROBBLE_COLS, db.dialect(), Some("s")))
        .push(FEED_JOINS);

    let mut conditions: Vec<Sql> = Vec::new();
    if let Some(ids) = &follow_ids {
        let mut condition = db.sql("s.user_id IN ");
        condition.bind_list(ids.iter().map(|id| id.as_str()));
        conditions.push(condition);
    }
    if let Some(filter) = filter {
        conditions.push(filter);
    }
    for (index, condition) in conditions.into_iter().enumerate() {
        sql.push(if index == 0 { " WHERE " } else { " AND " });
        sql.append(condition);
    }

    sql.push(" ORDER BY s.timestamp DESC LIMIT ")
        .bind(clamp_limit(params.limit))
        .push(" OFFSET ")
        .bind(clamp_offset(params.offset));

    let scrobbles: Vec<Scrobble> = db.fetch_all(&sql).await?;
    if scrobbles.is_empty() {
        return Ok(ScrobblesOutput::default());
    }

    let tracks = loaders::tracks_by_id(db, scrobbles.iter().map(|s| s.track_id.clone())).await?;
    let users = loaders::users_by_id(db, scrobbles.iter().map(|s| s.user_id.clone())).await?;
    let artists = loaders::artists_by_id(db, scrobbles.iter().map(|s| s.artist_id.clone())).await?;

    let track_ids: Vec<String> = tracks.keys().cloned().collect();
    let likes = likes::for_track_ids(db, &track_ids, viewer).await?;

    Ok(ScrobblesOutput {
        scrobbles: scrobbles
            .iter()
            .filter_map(|scrobble| {
                // A scrobble whose track or user row is missing cannot be
                // rendered; the TypeScript spread would have thrown on it and
                // been swallowed into an empty feed, so skipping the row keeps
                // the rest of the page usable.
                let track = tracks.get(scrobble.track_id.as_deref()?)?;
                let user = users.get(scrobble.user_id.as_deref()?)?;
                let artist = scrobble.artist_id.as_deref().and_then(|id| artists.get(id));
                let like = likes.get(&track.id).copied().unwrap_or_default();
                Some(ScrobbleViewBasic::new(scrobble, track, user, artist, like))
            })
            .collect(),
    })
}

/// Row ids of the users `did` follows.
async fn following_user_ids(db: &Backend, did: &str) -> Result<Vec<String>, sqlx::Error> {
    let mut sql = db.sql(
        "SELECT u.xata_id FROM follows f \
         INNER JOIN users u ON u.did = f.subject_did \
         WHERE f.follower_did = ",
    );
    sql.bind(did);
    db.fetch_scalars(&sql).await
}

#[derive(Debug, Clone, Deserialize)]
pub struct GetScrobbleParams {
    pub uri: String,
}

/// `app.rocksky.scrobble.getScrobble`
///
/// Auth is optional: the scrobble is public and a DID only fills in `liked`.
/// The TypeScript handler answers `{}` whenever anything fails — including an
/// unknown URI — so that is what an unknown URI returns here too.
async fn get_scrobble(
    state: web::Data<AppState>,
    params: web::Query<GetScrobbleParams>,
    auth: Auth,
) -> XrpcResult<HttpResponse> {
    match load_scrobble(&state, &params.uri, auth.did()).await {
        Ok(Some(view)) => json(view),
        Ok(None) => json(serde_json::json!({})),
        Err(err) => {
            tracing::error!(error = ?err, uri = %params.uri, "error retrieving scrobble");
            json(serde_json::json!({}))
        }
    }
}

async fn load_scrobble(
    state: &AppState,
    uri: &str,
    viewer: Option<&str>,
) -> anyhow::Result<Option<ScrobbleViewDetailed>> {
    let db = state.db();

    let mut sql = db.sql("SELECT ");
    sql.push(models::select_list(SCROBBLE_COLS, db.dialect(), None))
        .push(" FROM scrobbles WHERE uri = ");
    sql.bind(uri).push(" LIMIT 1");

    let Some(scrobble) = db.fetch_optional::<Scrobble>(&sql).await? else {
        return Ok(None);
    };

    let tracks = loaders::tracks_by_id(db, [scrobble.track_id.clone()]).await?;
    let users = loaders::users_by_id(db, [scrobble.user_id.clone()]).await?;
    let albums = loaders::albums_by_id(db, [scrobble.album_id.clone()]).await?;
    let artists = loaders::artists_by_id(db, [scrobble.artist_id.clone()]).await?;

    let (Some(track), Some(user)) = (
        scrobble.track_id.as_deref().and_then(|id| tracks.get(id)),
        scrobble.user_id.as_deref().and_then(|id| users.get(id)),
    ) else {
        // The TypeScript reads `scrobble.tracks.artist` unguarded, so a
        // dangling reference throws and is caught as `{}`. Same outcome.
        return Ok(None);
    };

    let track_artists = credited_artists(db, &track.artist).await?;

    let mut listeners = db.sql("SELECT count(DISTINCT user_id) FROM scrobbles WHERE track_id = ");
    listeners.bind(&track.id);

    let mut plays = db.sql("SELECT count(*) FROM scrobbles WHERE track_id = ");
    plays.bind(&track.id);

    Ok(Some(ScrobbleViewDetailed::new(
        &scrobble,
        track,
        user,
        scrobble.artist_id.as_deref().and_then(|id| artists.get(id)),
        scrobble
            .album_id
            .as_deref()
            .and_then(|id| albums.get(id))
            .and_then(|album| album.uri.clone()),
        track_artists,
        db.count(&listeners).await?,
        db.count(&plays).await?,
        first_scrobble(db, &track.id).await?,
        likes::for_track_id(db, &track.id, viewer).await?,
    )))
}

/// Resolves a track's comma-separated `artist` field to artist rows.
async fn credited_artists(db: &Backend, artist: &str) -> Result<Vec<Artist>, sqlx::Error> {
    let names: Vec<String> = artist
        .split(',')
        .map(|name| name.trim().to_string())
        .filter(|name| !name.is_empty())
        .collect();
    if names.is_empty() {
        return Ok(Vec::new());
    }

    let mut sql = db.sql("SELECT ");
    sql.push(models::select_list(models::ARTIST_COLS, db.dialect(), None))
        .push(" FROM artists WHERE name IN ");
    sql.bind_list(names.iter().map(|name| name.as_str()));
    db.fetch_all(&sql).await
}

/// Who played this track first.
async fn first_scrobble(
    db: &Backend,
    track_id: &str,
) -> Result<Option<FirstScrobbleView>, sqlx::Error> {
    let mut sql = db.sql(
        "SELECT u.handle, u.avatar, s.timestamp FROM scrobbles s \
         LEFT JOIN users u ON u.xata_id = s.user_id \
         WHERE s.track_id = ",
    );
    sql.bind(track_id).push(" ORDER BY s.timestamp ASC LIMIT 1");

    let row: Option<(
        Option<String>,
        Option<String>,
        chrono::DateTime<chrono::Utc>,
    )> = db.fetch_optional(&sql).await?;

    Ok(row.and_then(|(handle, avatar, timestamp)| {
        Some(FirstScrobbleView {
            handle: handle?,
            avatar: avatar.unwrap_or_default(),
            timestamp,
        })
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_cache_key_matches_the_typescript_shape() {
        let params = GetScrobblesParams {
            did: Some("did:plc:abc".into()),
            filter: Some("title==Roygbiv".into()),
            following: Some(true),
            limit: Some(10),
            offset: Some(20),
        };
        assert_eq!(
            cache_key(&params, Some("7".into())),
            "scrobbles:getScrobbles:v2:7:did:plc:abc:1:10:20:title==Roygbiv"
        );
    }

    #[test]
    fn an_anonymous_unfiltered_key_matches_the_typescript_shape() {
        let params = GetScrobblesParams {
            did: None,
            filter: None,
            following: None,
            limit: None,
            offset: None,
        };
        // `params.did ?? "anon"`, `following ? "1" : "0"`, then one empty
        // segment each for limit, offset and filter — so three trailing colons.
        assert_eq!(
            cache_key(&params, None),
            "scrobbles:getScrobbles:v2:0:anon:0:::"
        );
    }

    #[test]
    fn the_filter_allowlist_covers_the_typescript_field_map() {
        // Dropping a selector here turns a working client filter into a 400.
        for selector in [
            "uri",
            "date",
            "timestamp",
            "title",
            "artist",
            "album",
            "track.title",
            "track.artist",
            "track.album",
            "track.albumArtist",
            "track.genre",
            "track.duration",
            "track.isrc",
            "track.mbId",
            "user.did",
            "user.handle",
            "user.displayName",
            "artist.name",
            "artist.genres",
        ] {
            assert!(
                FILTER_FIELDS.iter().any(|(name, _)| *name == selector),
                "missing filter field {selector}"
            );
        }
        assert_eq!(FILTER_FIELDS.len(), 19);
    }

    #[test]
    fn every_filter_selector_uses_a_table_alias_the_query_defines() {
        // A filter compiling to `x.foo` when the query has no `x` would fail
        // at runtime, only for the clients that use that selector.
        for (name, field) in FILTER_FIELDS {
            let alias = field.column.split('.').next().unwrap();
            assert!(
                matches!(alias, "s" | "t" | "u" | "a"),
                "{name} references unknown table alias {alias:?}"
            );
            assert!(
                FEED_JOINS.contains(&format!(" {alias} ")) || alias == "s",
                "{name} uses alias {alias:?}, which FEED_JOINS does not define"
            );
        }
    }

    #[test]
    fn params_deserialize_from_a_query_string() {
        let params: GetScrobblesParams =
            serde_urlencoded::from_str("did=did:plc:abc&following=true&limit=5").unwrap();
        assert_eq!(params.did.as_deref(), Some("did:plc:abc"));
        assert_eq!(params.following, Some(true));
        assert_eq!(params.limit, Some(5));
        assert_eq!(params.offset, None);
    }
}
