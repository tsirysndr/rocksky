//! `app.rocksky.scrobble.*`

use crate::auth::Auth;
use crate::db::models::{Artist, Scrobble, ARTIST_COLS, SCROBBLE_COLS};
use crate::db::schema::{Artists, Follows, Scrobbles, Tracks, Users};
use crate::db::{loaders, Backend};
use crate::error::XrpcResult;
use crate::likes;
use crate::rsql::{Field, FieldMap};
use crate::sea_query::{
    Alias, Asterisk, Expr, Func, JoinType, Order, Query, SelectStatement, SimpleExpr,
};
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
fn feed_joins(query: &mut SelectStatement) {
    query
        .from_as(Scrobbles::Table, Alias::new("s"))
        .join_as(
            JoinType::LeftJoin,
            Tracks::Table,
            Alias::new("t"),
            Expr::col((Alias::new("t"), Tracks::XataId))
                .equals((Alias::new("s"), Scrobbles::TrackId)),
        )
        .join_as(
            JoinType::LeftJoin,
            Users::Table,
            Alias::new("u"),
            Expr::col((Alias::new("u"), Users::XataId))
                .equals((Alias::new("s"), Scrobbles::UserId)),
        )
        .join_as(
            JoinType::LeftJoin,
            Artists::Table,
            Alias::new("a"),
            Expr::col((Alias::new("a"), Artists::XataId))
                .equals((Alias::new("s"), Scrobbles::ArtistId)),
        );
}

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
    let filter = state.db().filter(params.filter.as_deref(), FILTER_FIELDS)?;

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
    filter: Option<SimpleExpr>,
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
    let mut query = Query::select();
    db.select_model(&mut query, SCROBBLE_COLS, Some("s"));
    feed_joins(&mut query);

    if let Some(ids) = &follow_ids {
        query.and_where(
            Expr::col((Alias::new("s"), Scrobbles::UserId)).is_in(ids.iter().map(|id| id.as_str())),
        );
    }
    if let Some(filter) = filter {
        query.and_where(filter);
    }

    query
        .order_by((Alias::new("s"), Scrobbles::Timestamp), Order::Desc)
        .limit(clamp_limit(params.limit) as u64)
        .offset(clamp_offset(params.offset) as u64);

    let scrobbles: Vec<Scrobble> = db.fetch_all(&query).await?;
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
    let query = Query::select()
        .column((Alias::new("u"), Users::XataId))
        .from_as(Follows::Table, Alias::new("f"))
        .join_as(
            JoinType::InnerJoin,
            Users::Table,
            Alias::new("u"),
            Expr::col((Alias::new("u"), Users::Did)).equals((Alias::new("f"), Follows::SubjectDid)),
        )
        .and_where(Expr::col((Alias::new("f"), Follows::FollowerDid)).eq(did))
        .take();

    db.fetch_scalars(&query).await
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

    let mut query = Query::select();
    db.select_model(&mut query, SCROBBLE_COLS, None);
    query
        .from(Scrobbles::Table)
        .and_where(Expr::col(Scrobbles::Uri).eq(uri))
        .limit(1);

    let Some(scrobble) = db.fetch_optional::<Scrobble>(&query).await? else {
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

    let listeners = Query::select()
        .expr(Func::count_distinct(Expr::col(Scrobbles::UserId)))
        .from(Scrobbles::Table)
        .and_where(Expr::col(Scrobbles::TrackId).eq(&track.id))
        .take();

    let plays = Query::select()
        .expr(Func::count(Expr::col(Asterisk)))
        .from(Scrobbles::Table)
        .and_where(Expr::col(Scrobbles::TrackId).eq(&track.id))
        .take();

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

    let mut query = Query::select();
    db.select_model(&mut query, ARTIST_COLS, None);
    query
        .from(Artists::Table)
        .and_where(Expr::col(Artists::Name).is_in(names.iter().map(|name| name.as_str())));

    db.fetch_all(&query).await
}

/// Who played this track first.
async fn first_scrobble(
    db: &Backend,
    track_id: &str,
) -> Result<Option<FirstScrobbleView>, sqlx::Error> {
    let query = Query::select()
        .column((Alias::new("u"), Users::Handle))
        .column((Alias::new("u"), Users::Avatar))
        .column((Alias::new("s"), Scrobbles::Timestamp))
        .from_as(Scrobbles::Table, Alias::new("s"))
        .join_as(
            JoinType::LeftJoin,
            Users::Table,
            Alias::new("u"),
            Expr::col((Alias::new("u"), Users::XataId))
                .equals((Alias::new("s"), Scrobbles::UserId)),
        )
        .and_where(Expr::col((Alias::new("s"), Scrobbles::TrackId)).eq(track_id))
        .order_by((Alias::new("s"), Scrobbles::Timestamp), Order::Asc)
        .limit(1)
        .take();

    let row: Option<(
        Option<String>,
        Option<String>,
        chrono::DateTime<chrono::Utc>,
    )> = db.fetch_optional(&query).await?;

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

    /// Two users, one album, two plays of one track and one of another.
    async fn fixture() -> AppState {
        let state = AppState::for_test().await.unwrap();
        let db = state.db();

        for statement in [
            "INSERT INTO users (xata_id, did, handle, avatar) VALUES \
             ('rec_alice', 'did:plc:alice', 'alice.test', 'a'), \
             ('rec_bob', 'did:plc:bob', 'bob.test', 'b')",
            "INSERT INTO artists (xata_id, name, sha256, genres) VALUES \
             ('rec_artist', 'Boards of Canada', 'sha-artist', '[\"electronic\"]')",
            "INSERT INTO albums (xata_id, title, artist, sha256) VALUES \
             ('rec_album', 'MHTRTC', 'Boards of Canada', 'sha-album')",
            "INSERT INTO tracks (xata_id, title, artist, album_artist, album, duration, sha256) \
             VALUES ('rec_t1', 'Roygbiv', 'Boards of Canada', 'Boards of Canada', 'MHTRTC', 1, 'sha-t1')",
            "INSERT INTO scrobbles (xata_id, user_id, track_id, album_id, artist_id, uri, timestamp) \
             VALUES \
             ('rec_s1', 'rec_alice', 'rec_t1', 'rec_album', 'rec_artist', 'at://1', '2026-01-01T00:00:00.000Z'), \
             ('rec_s2', 'rec_bob', 'rec_t1', 'rec_album', 'rec_artist', 'at://2', '2026-01-02T00:00:00.000Z')",
            "INSERT INTO follows (xata_id, uri, follower_did, subject_did) VALUES \
             ('rec_f1', 'at://f1', 'did:plc:alice', 'did:plc:bob')",
        ] {
            db.execute(&db.sql(statement)).await.unwrap();
        }

        state
    }

    fn params() -> GetScrobblesParams {
        GetScrobblesParams {
            did: None,
            filter: None,
            following: None,
            limit: None,
            offset: None,
        }
    }

    /// The feed's joins, its RSQL filter and its `following` restriction all
    /// have to *run*: the filter selectors compile to `t.`/`u.`/`a.` column
    /// references, and a join this query did not define would fail only for
    /// the clients that filter on it.
    #[tokio::test]
    async fn the_feed_reads_a_real_database() {
        let state = fixture().await;

        let output = load_scrobbles(&state, &params(), None, None).await.unwrap();
        // Newest first.
        assert_eq!(output.scrobbles.len(), 2);
        assert_eq!(output.scrobbles[0].id, "rec_s2");

        // A filter reaching each joined table in turn.
        for filter in [
            "title==Roygbiv",
            "user.handle==bob.test",
            "artist.name==\"Boards of Canada\"",
            "track.duration==1",
        ] {
            let compiled = state.db().filter(Some(filter), FILTER_FIELDS).unwrap();
            let output = load_scrobbles(&state, &params(), compiled, None)
                .await
                .unwrap_or_else(|err| panic!("{filter:?} failed: {err}"));
            assert!(!output.scrobbles.is_empty(), "{filter:?} matched nothing");
        }

        // `following` restricts the feed to the accounts alice follows, which
        // is bob and not herself.
        let following = GetScrobblesParams {
            did: Some("did:plc:alice".into()),
            following: Some(true),
            ..params()
        };
        let output = load_scrobbles(&state, &following, None, None)
            .await
            .unwrap();
        assert_eq!(output.scrobbles.len(), 1);
        assert_eq!(output.scrobbles[0].id, "rec_s2");
    }

    /// The detail page's counts and its first-scrobble lookup.
    #[tokio::test]
    async fn the_detail_counts_plays_and_listeners() {
        let state = fixture().await;

        let view = load_scrobble(&state, "at://2", None)
            .await
            .unwrap()
            .expect("the scrobble is found by its uri");

        assert_eq!(view.scrobbles, 2, "total plays of the track");
        assert_eq!(view.listeners, 2, "distinct listeners");
        // The comma-separated `artist` field resolved to the artist row.
        assert_eq!(view.artists.len(), 1);
        assert_eq!(view.artists[0].name, "Boards of Canada");
        // And alice played it first.
        let first = view.first_scrobble.expect("someone played it first");
        assert_eq!(first.handle, "alice.test");

        // An unknown URI is not found rather than an error.
        assert!(load_scrobble(&state, "at://nope", None)
            .await
            .unwrap()
            .is_none());
    }

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
        // at runtime, only for the clients that use that selector. Checked
        // against the rendered joins rather than a list of names, so the two
        // cannot drift.
        let mut query = Query::select();
        feed_joins(&mut query);
        let joins = query.to_string(crate::sea_query::SqliteQueryBuilder);

        for (name, field) in FILTER_FIELDS {
            let alias = field.column.split('.').next().unwrap();
            assert!(
                joins.contains(&format!(r#"AS "{alias}""#)),
                "{name} uses alias {alias:?}, which the feed joins do not define: {joins}"
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
