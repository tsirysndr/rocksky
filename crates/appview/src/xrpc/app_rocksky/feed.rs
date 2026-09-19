//! `app.rocksky.feed.*` — search, the generator registry, and the feeds.
//!
//! # Where the feed comes from
//!
//! `apps/api` does not build a feed. Its `getFeed` looks the URI up in `feeds`,
//! turns the row's `did:web:` DID into an origin and asks *that* service for
//! `app.rocksky.feed.getFeedSkeleton` — the feed generator, `apps/feeds`, which
//! holds the algorithms and has its own publisher DID and DID document.
//!
//! The feed is assembled from this instance's own tables instead, because there
//! is no feed-generator URL in [`crate::config::Config`] to call and a
//! self-hosted box should not need a companion service to show a feed. The
//! algorithms are the ones `apps/feeds/src/algos` publishes — `all`, and one per
//! genre, selected by record key. [`GENRE_FEEDS`] is that table.
//!
//! `getFeedSkeleton` and `describeFeedGenerator` are the feed generator's own
//! endpoints and are deliberately not served here: the first would publish this
//! instance as a generator it is not, and the second answers with the service
//! DID a client resolves to reach one — which this binary does not have, since
//! nothing here serves a `did:web` document and the DIDs in `feeds.did` belong
//! to whoever published each record.

use crate::auth::Auth;
use crate::db::models::{Scrobble, SCROBBLE_COLS};
use crate::db::schema::{Albums, Artists, Feeds, Follows, Scrobbles, Tracks, Users};
use crate::db::{format_timestamp, loaders, Backend};
use crate::error::{XrpcError, XrpcResult};
use crate::likes;
use crate::sea_query::{Alias, Expr, JoinType, Order, Query, SelectStatement, WindowStatement};
use crate::search::FederatedResults;
use crate::state::AppState;
use crate::views::ScrobbleViewBasic;
use crate::xrpc::{clamp_limit_or, json};
use crate::xrpc_query;
use actix_web::web::{self, ServiceConfig};
use actix_web::HttpResponse;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::time::Duration;

pub fn configure(cfg: &mut ServiceConfig) {
    xrpc_query!(cfg, "app.rocksky.feed.getFeed", get_feed);
    xrpc_query!(cfg, "app.rocksky.feed.getFeedGenerator", get_feed_generator);
    xrpc_query!(
        cfg,
        "app.rocksky.feed.getFeedGenerators",
        get_feed_generators
    );
    xrpc_query!(cfg, "app.rocksky.feed.getStories", get_stories);
    xrpc_query!(cfg, "app.rocksky.feed.search", search);
    // `getFeedSkeleton` and `describeFeedGenerator` belong to the feed
    // generator service — see the module documentation.
}

/// Hits per collection when the caller does not say.
const DEFAULT_SIZE: usize = 20;

/// The most any caller may ask for per collection.
///
/// Five collections, so the response can hold five hundred documents. Above
/// that the payload costs more than the search.
const MAX_SIZE: usize = 100;

#[derive(Debug, Clone, Deserialize)]
pub struct SearchParams {
    pub query: String,
    /// Hits per collection.
    ///
    /// Not in the lexicon, which declares only `query`. `apps/api` reads it
    /// anyway and the web client sends it, so it is honoured here too — a
    /// lexicon that under-describes a live parameter is a lexicon to fix, not a
    /// reason to break the client.
    #[serde(default)]
    pub size: Option<usize>,
}

/// `app.rocksky.feed.search`
///
/// Searches albums, artists, tracks, users and playlists in one request. Each
/// hit carries `_federation.indexUid` naming the collection it came from, which
/// is how the client decides what to render — see `apps/web/src/types/search.ts`.
async fn search(
    state: web::Data<AppState>,
    params: web::Query<SearchParams>,
) -> XrpcResult<HttpResponse> {
    let query = params.query.trim();
    if query.is_empty() {
        // Not an error: an empty search box is a normal state, and `*` against
        // five collections would return an arbitrary slice of the catalogue.
        return json(FederatedResults::default());
    }

    let size = params.size.unwrap_or(DEFAULT_SIZE).clamp(1, MAX_SIZE);

    let Some(search) = state.search() else {
        // Only reachable under test — the index is required at boot.
        tracing::warn!("search was called with no index configured");
        return json(FederatedResults::default());
    };

    match search.federated(query, size).await {
        Ok(results) => json(results),
        Err(err) => {
            // An empty result set rather than a 500: the search box is one part
            // of a page, and failing the request would break the page around
            // it. The log is where the outage is reported.
            tracing::error!(error = %err, query, "search failed");
            json(FederatedResults::default())
        }
    }
}

// --------------------------------------------------------------- algorithms

/// The collection a feed generator record lives in.
const FEED_COLLECTION: &str = "app.rocksky.feed.generator";

/// The record key of the unfiltered feed.
const ALL_FEED: &str = "all";

/// Every genre feed `apps/feeds/src/algos` publishes, as `(record key, genre)`.
///
/// A table rather than a rule, because the two are not the same string: most
/// keys are the genre with spaces hyphenated, some keep their own hyphens
/// (`j-pop`, `lo-fi`), and `rnb` filters on `r&b`.
const GENRE_FEEDS: &[(&str, &str)] = &[
    ("afrobeat", "afrobeat"),
    ("afrobeats", "afrobeats"),
    ("alternative-metal", "alternative metal"),
    ("alternative-rnb", "alternative rnb"),
    ("anime", "anime"),
    ("art-pop", "art pop"),
    ("breakcore", "breakcore"),
    ("chicago-drill", "chicago drill"),
    ("chillwave", "chillwave"),
    ("country-hip-hop", "country hip hop"),
    ("crunk", "crunk"),
    ("dance-pop", "dance pop"),
    ("deep-house", "deep house"),
    ("drill", "drill"),
    ("dubstep", "dubstep"),
    ("emo", "emo"),
    ("grunge", "grunge"),
    ("hard-rock", "hard rock"),
    ("heavy-metal", "heavy metal"),
    ("hip-hop", "hip hop"),
    ("house", "house"),
    ("hyperpop", "hyperpop"),
    ("indie", "indie"),
    ("indie-rock", "indie rock"),
    ("j-pop", "j-pop"),
    ("j-rock", "j-rock"),
    ("jazz", "jazz"),
    ("k-pop", "k-pop"),
    ("lo-fi", "lo-fi"),
    ("metal", "metal"),
    ("metalcore", "metalcore"),
    ("midwest-emo", "midwest emo"),
    ("nu-metal", "nu metal"),
    ("pop-punk", "pop punk"),
    ("post-grunge", "post-grunge"),
    ("rap", "rap"),
    ("rap-metal", "rap metal"),
    ("rnb", "r&b"),
    ("rock", "rock"),
    ("southern-hip-hop", "southern hip hop"),
    ("speedcore", "speedcore"),
    ("swedish-pop", "swedish pop"),
    ("synthwave", "synthwave"),
    ("thrash-metal", "thrash metal"),
    ("trap", "trap"),
    ("trap-soul", "trap soul"),
    ("tropical-house", "tropical house"),
    ("vaporwave", "vaporwave"),
    ("visual-kei", "visual kei"),
    ("vocaloid", "vocaloid"),
    ("west-coast-hip-hop", "west coast hip hop"),
];

/// What a feed URI selects.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Algorithm {
    /// Every scrobble, newest first.
    All,
    /// Scrobbles whose artist carries this genre.
    Genre(&'static str),
}

/// Resolves `at://<did>/app.rocksky.feed.generator/<rkey>` to its algorithm.
///
/// The publisher DID is not checked, unlike `apps/feeds`, which pairs each key
/// with the one DID it publishes from. Nothing in this binary indexes
/// `app.rocksky.feed.generator` records, so a self-hosted instance has no
/// record of who published what and checking would leave it serving no feed at
/// all; the record key is what names the algorithm either way.
fn algorithm(feed: &str) -> Option<Algorithm> {
    let mut parts = feed.strip_prefix("at://")?.split('/');
    let _publisher = parts.next()?;
    if parts.next()? != FEED_COLLECTION {
        return None;
    }
    let rkey = parts.next()?;
    if parts.next().is_some() {
        return None;
    }

    if rkey == ALL_FEED {
        return Some(Algorithm::All);
    }
    GENRE_FEEDS
        .iter()
        .find(|(key, _)| *key == rkey)
        .map(|(_, genre)| Algorithm::Genre(genre))
}

// --------------------------------------------------------------- the feed

/// What `apps/feeds` applies when `getFeed` forwards no limit at all.
const FEED_DEFAULT_LIMIT: i64 = 50;

/// How long a rendered feed page stays cached, matching `FEED_CACHE_TTL` in
/// the TypeScript handler.
const FEED_CACHE_TTL: Duration = Duration::from_secs(30);

/// Bumped per feed URI by `bumpAllFeedVersions`, which invalidates every
/// cached page of that feed at once.
fn feed_version_key(feed: &str) -> String {
    format!("feed:ver:{feed}")
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetFeedParams {
    pub feed: String,
    #[serde(default)]
    pub limit: Option<i64>,
    #[serde(default)]
    pub cursor: Option<String>,
}

/// One entry of `feedView`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FeedItemView {
    pub scrobble: ScrobbleViewBasic,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct FeedOutput {
    pub feed: Vec<FeedItemView>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cursor: Option<String>,
}

/// A page of a feed, hydrated.
struct FeedPage {
    scrobbles: Vec<ScrobbleViewBasic>,
    cursor: Option<String>,
}

/// `app.rocksky.feed.getFeed`
///
/// The TypeScript handler answers an empty body on any failure — including an
/// unknown feed URI — so that is what happens here too. Its empty body is
/// `{ scrobbles: [] }`, which is not the `feedView` the lexicon declares and
/// not what its own success path returns; an empty `feed` is returned instead,
/// so a client can read `feed` unconditionally.
async fn get_feed(
    state: web::Data<AppState>,
    params: web::Query<GetFeedParams>,
    auth: Auth,
) -> XrpcResult<HttpResponse> {
    let params = params.into_inner();
    let did = auth.did();

    let version = state.cache().get(&feed_version_key(&params.feed)).await;
    let key = feed_cache_key(&params, version, did);
    if let Some(cached) = state.cache().get_json::<FeedOutput>(&key).await {
        return json(cached);
    }

    let Some(algorithm) = algorithm(&params.feed) else {
        return json(FeedOutput::default());
    };

    let page = match load_page(
        &state,
        algorithm,
        clamp_limit_or(params.limit, FEED_DEFAULT_LIMIT),
        params.cursor.as_deref(),
        did,
    )
    .await
    {
        Ok(page) => page,
        Err(err) => {
            tracing::error!(error = ?err, feed = %params.feed, "error retrieving a feed");
            return json(FeedOutput::default());
        }
    };

    let output = FeedOutput {
        feed: page
            .scrobbles
            .into_iter()
            .map(|scrobble| FeedItemView { scrobble })
            .collect(),
        cursor: page.cursor,
    };

    state.cache().set_json(&key, FEED_CACHE_TTL, &output).await;
    json(output)
}

/// Mirrors the TypeScript `cacheKey`, including the version segment.
fn feed_cache_key(params: &GetFeedParams, version: Option<String>, did: Option<&str>) -> String {
    format!(
        "feed:getFeed:v2:{}:{}:{}:{}:{}",
        did.unwrap_or("anon"),
        params.feed,
        version.unwrap_or_else(|| "0".into()),
        params.limit.map(|v| v.to_string()).unwrap_or_default(),
        params.cursor.as_deref().unwrap_or(""),
    )
}

async fn load_page(
    state: &AppState,
    algorithm: Algorithm,
    limit: i64,
    cursor: Option<&str>,
    viewer: Option<&str>,
) -> anyhow::Result<FeedPage> {
    let db = state.db();
    let before = cursor.and_then(parse_cursor);

    // A genre feed differs from the everything feed only by a predicate — see
    // `apply_bounds`. Both are one query for one page.
    let genre = match algorithm {
        Algorithm::All => None,
        Algorithm::Genre(genre) => Some(genre),
    };

    let query = scrobble_page(db, Bounds::before(before).genre(genre), limit);
    let scrobbles: Vec<Scrobble> = db.fetch_all(&query).await?;
    // A cursor only for a full page, so a caller looping until it is absent
    // terminates. `apps/feeds` returns one for a short page too, which costs
    // that caller one extra empty request.
    let resume = (scrobbles.len() as i64 == limit)
        .then(|| scrobbles.last().map(|scrobble| scrobble.timestamp))
        .flatten();

    Ok(FeedPage {
        scrobbles: hydrate(db, &scrobbles, viewer).await?,
        cursor: resume.map(|at| at.timestamp_millis().to_string()),
    })
}

/// What narrows a read of `scrobbles`.
#[derive(Debug, Default, Clone, Copy)]
struct Bounds<'a> {
    /// Strictly older than this — the feed's cursor.
    before: Option<DateTime<Utc>>,
    /// Strictly newer than this, which the stories use for their window.
    after: Option<DateTime<Utc>>,
    /// Only these listeners' rows.
    listeners: Option<&'a [String]>,
    /// Only rows whose artist carries this genre.
    genre: Option<&'a str>,
}

impl<'a> Bounds<'a> {
    fn before(at: Option<DateTime<Utc>>) -> Self {
        Self {
            before: at,
            ..Self::default()
        }
    }

    fn genre(self, genre: Option<&'a str>) -> Self {
        Self { genre, ..self }
    }
}

/// Narrows a `scrobbles` query, which must be aliased `s`, to `bounds`.
fn apply_bounds(db: &Backend, query: &mut SelectStatement, bounds: Bounds<'_>) {
    let timestamp = || Expr::col((Alias::new("s"), Scrobbles::Timestamp));

    // Both bounds as ISO text, not as native timestamps: SQLite holds this
    // column as TEXT and compares it lexicographically, so any other shape
    // would silently match the wrong rows.
    if let Some(before) = bounds.before {
        query.and_where(timestamp().lt(db.timestamp_value(format_timestamp(before))));
    }
    if let Some(after) = bounds.after {
        query.and_where(timestamp().gt(db.timestamp_value(format_timestamp(after))));
    }
    if let Some(listeners) = bounds.listeners {
        query.and_where(
            Expr::col((Alias::new("s"), Scrobbles::UserId))
                .is_in(listeners.iter().map(String::as_str)),
        );
    }

    // The genre lives on the artist, so it costs a join — an inner one, which
    // also drops the scrobbles whose artist row is missing, exactly as the
    // Rust-side match used to.
    //
    // `artist_id` is unique in `artists`, so this cannot multiply rows.
    if let Some(genre) = bounds.genre {
        query
            .join_as(
                JoinType::InnerJoin,
                Artists::Table,
                Alias::new("a"),
                Expr::col((Alias::new("s"), Scrobbles::ArtistId))
                    .equals((Alias::new("a"), Artists::XataId)),
            )
            .and_where(db.array_contains("a.genres", genre));
    }
}

/// One page of `scrobbles`, newest first.
///
/// Extracted so the ordering and the bounds can be asserted without a
/// database.
fn scrobble_page(db: &Backend, bounds: Bounds<'_>, limit: i64) -> SelectStatement {
    let mut query = Query::select();
    db.select_model(&mut query, SCROBBLE_COLS, Some("s"));
    query.from_as(Scrobbles::Table, Alias::new("s"));
    apply_bounds(db, &mut query, bounds);

    query
        .order_by((Alias::new("s"), Scrobbles::Timestamp), Order::Desc)
        // The cursor only carries a millisecond, so scrobbles sharing one are
        // ordered by id to keep paging deterministic. It cannot make the
        // boundary exact: `timestamp < cursor` still drops the rows that share
        // the last row's millisecond, which is a property of the cursor format
        // `apps/feeds` established and clients now hold.
        .order_by((Alias::new("s"), Scrobbles::XataId), Order::Desc)
        .limit(limit as u64);
    query
}

/// Reads a cursor as an epoch-millisecond timestamp.
///
/// Anything unparseable is treated as absent rather than erroring: a stale
/// cursor should restart the feed, not break the page.
fn parse_cursor(cursor: &str) -> Option<DateTime<Utc>> {
    DateTime::from_timestamp_millis(cursor.trim().parse().ok()?)
}

/// Fills in the track, listener, artist and like state each row needs.
async fn hydrate(
    db: &Backend,
    scrobbles: &[Scrobble],
    viewer: Option<&str>,
) -> anyhow::Result<Vec<ScrobbleViewBasic>> {
    if scrobbles.is_empty() {
        return Ok(Vec::new());
    }

    // All four at once, because none of them needs another's answer.
    //
    // `getFeed.ts` hydrates in a single joined statement; these are four, but
    // they are four *concurrent* statements, so the page waits for one round
    // trip rather than four. Against the hosted database that is the whole
    // difference — 95 ms of latency before any of them does any work.
    //
    // The like lookup takes its ids from the scrobbles rather than from the
    // loaded tracks, which is what used to make it wait for them. The two sets
    // differ only by tracks that no longer exist, and those simply have no
    // likes to find.
    let track_ids: Vec<String> = scrobbles
        .iter()
        .filter_map(|scrobble| scrobble.track_id.clone())
        .collect();

    let (tracks, users, artists, likes) = tokio::try_join!(
        loaders::tracks_by_id(db, scrobbles.iter().map(|s| s.track_id.clone())),
        loaders::users_by_id(db, scrobbles.iter().map(|s| s.user_id.clone())),
        loaders::artists_by_id(db, scrobbles.iter().map(|s| s.artist_id.clone())),
        likes::for_track_ids(db, &track_ids, viewer),
    )?;

    Ok(scrobbles
        .iter()
        .filter_map(|scrobble| {
            // A row whose track or listener is missing cannot be rendered; the
            // TypeScript spread would have thrown on it and been caught as an
            // empty feed, so skipping it keeps the rest of the page usable.
            let track = tracks.get(scrobble.track_id.as_deref()?)?;
            let user = users.get(scrobble.user_id.as_deref()?)?;
            // `getFeed.ts` reaches the artist through `tracks.artist_uri`
            // instead; this is the same artist by the scrobble's own key, and
            // the one the global feed uses.
            let artist = scrobble.artist_id.as_deref().and_then(|id| artists.get(id));
            let like = likes.get(&track.id).copied().unwrap_or_default();
            Some(ScrobbleViewBasic::new(scrobble, track, user, artist, like))
        })
        .collect())
}

// ---------------------------------------------------------------- stories

/// `params.size || 20` in the TypeScript handler.
const STORIES_DEFAULT_SIZE: i64 = 20;

const STORIES_CACHE_TTL: Duration = Duration::from_secs(30);

/// The window the latest-per-user query is bounded to before it gives up and
/// scans everything.
const STORIES_WINDOW_DAYS: i64 = 30;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetStoriesParams {
    #[serde(default)]
    pub size: Option<i64>,
    #[serde(default)]
    pub feed: Option<String>,
    #[serde(default)]
    pub following: Option<bool>,
}

/// One user's current track.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoryView {
    pub album: String,
    pub album_art: Option<String>,
    pub album_artist: String,
    #[serde(default, with = "crate::views::uri")]
    pub album_uri: Option<String>,
    pub artist: String,
    #[serde(default, with = "crate::views::uri")]
    pub artist_uri: Option<String>,
    pub avatar: String,
    /// The scrobble's timestamp, not the track row's creation time.
    #[serde(with = "crate::views::timestamp::required")]
    pub created_at: DateTime<Utc>,
    pub did: String,
    pub handle: String,
    /// The *track* row id, which is what `getStories.ts` puts here — the same
    /// value as `trackId`, not the scrobble's id.
    pub id: String,
    pub title: String,
    pub track_id: String,
    #[serde(default, with = "crate::views::uri")]
    pub track_uri: Option<String>,
    /// The scrobble's AT-URI.
    #[serde(default, with = "crate::views::uri")]
    pub uri: Option<String>,
    pub liked: bool,
    pub likes_count: i64,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct StoriesOutput {
    pub stories: Vec<StoryView>,
}

/// `app.rocksky.feed.getStories`
///
/// `following` needs a DID, and the TypeScript handler swallows its own
/// "Authentication required" into an empty body. It is reported as a 401 here
/// instead: a caller who forgot the token cannot tell the difference between
/// that and nobody they follow listening to anything.
async fn get_stories(
    state: web::Data<AppState>,
    params: web::Query<GetStoriesParams>,
    auth: Auth,
) -> XrpcResult<HttpResponse> {
    let params = params.into_inner();
    let did = auth.did();

    if params.following == Some(true) && did.is_none() {
        return Err(XrpcError::auth_required(
            "Authentication required when filtering by following",
        ));
    }

    let key = stories_cache_key(&params, did);
    if let Some(cached) = state.cache().get_json::<StoriesOutput>(&key).await {
        return json(cached);
    }

    let output = match load_stories(&state, &params, did).await {
        Ok(stories) => StoriesOutput { stories },
        Err(err) => {
            tracing::error!(error = ?err, "error retrieving now playing songs");
            // An empty list rather than the TypeScript handler's `{}`: a
            // failure should not change the shape the success path promises.
            return json(StoriesOutput::default());
        }
    };

    state
        .cache()
        .set_json(&key, STORIES_CACHE_TTL, &output)
        .await;
    json(output)
}

/// The `Cache.make` key of the TypeScript handler, spelled as a string.
fn stories_cache_key(params: &GetStoriesParams, did: Option<&str>) -> String {
    format!(
        "feed:getStories:v1:{}:{}:{}:{}",
        did.unwrap_or("anon"),
        params.feed.as_deref().unwrap_or(""),
        if params.following == Some(true) {
            "1"
        } else {
            "0"
        },
        params.size.map(|v| v.to_string()).unwrap_or_default(),
    )
}

async fn load_stories(
    state: &AppState,
    params: &GetStoriesParams,
    viewer: Option<&str>,
) -> anyhow::Result<Vec<StoryView>> {
    let db = state.db();
    let size = clamp_limit_or(params.size, STORIES_DEFAULT_SIZE);

    // `feed` restricts the stories to one algorithm. The TypeScript handler
    // asks the feed generator for a page of scrobble URIs and filters on those,
    // which silently limits it to that page — fifty rows, the generator's
    // default — so a feed-filtered stories list there is the users behind the
    // fifty newest scrobbles rather than the newest scrobble per user. The walk
    // below is bounded too, but by a thousand rows rather than fifty, and it
    // ranks per listener rather than filtering a ranking.
    let genre = match params.feed.as_deref().map(algorithm) {
        None | Some(Some(Algorithm::All)) => None,
        Some(Some(Algorithm::Genre(genre))) => Some(genre),
        // An unknown feed selects nothing, rather than everything.
        Some(None) => return Ok(Vec::new()),
    };

    let followed = match (params.following, viewer) {
        (Some(true), Some(did)) => Some(followed_user_ids(db, did).await?),
        _ => None,
    };
    if followed.as_ref().is_some_and(|ids| ids.is_empty()) {
        return Ok(Vec::new());
    }

    // The latest scrobble per user over the whole table is a full sort of
    // `scrobbles`; bound it to recent activity and only pay for the unbounded
    // scan when the window cannot fill the page.
    let since = Utc::now() - chrono::Duration::days(STORIES_WINDOW_DAYS);
    let mut rows = db
        .fetch_all::<StoryRow>(&stories_query(
            db,
            genre,
            followed.as_deref(),
            Some(since),
            size,
        ))
        .await?;
    if (rows.len() as i64) < size {
        rows = db
            .fetch_all::<StoryRow>(&stories_query(db, genre, followed.as_deref(), None, size))
            .await?;
    }
    if rows.is_empty() {
        return Ok(Vec::new());
    }

    let track_ids: Vec<String> = rows.iter().map(|row| row.track_id.clone()).collect();
    let likes = likes::for_track_ids(db, &track_ids, viewer).await?;

    Ok(rows
        .into_iter()
        .map(|row| {
            let like = likes.get(&row.track_id).copied().unwrap_or_default();
            StoryView {
                album: row.album,
                album_art: row.album_art,
                album_artist: row.album_artist,
                album_uri: row.album_uri,
                artist: row.artist,
                artist_uri: row.artist_uri,
                avatar: row.avatar,
                created_at: row.timestamp,
                did: row.did,
                handle: row.handle,
                // The *track* row id, which is what `getStories.ts` puts here.
                id: row.track_id.clone(),
                title: row.title,
                track_id: row.track_id,
                track_uri: row.track_uri,
                uri: row.uri,
                liked: like.liked,
                likes_count: like.count,
            }
        })
        .collect())
}

/// Exactly the columns `getStories.ts` selects, and no more.
///
/// The TypeScript hydrates a story in the same statement that finds it — one
/// `select(baseSelect)` with four joins — and that is what is copied here. The
/// previous shape found the scrobbles, then loaded tracks, users, artists and
/// albums as four further round trips. That is not a query-planning problem:
/// the hosted database answers in 95 ms before it does any work, so four extra
/// trips are 380 ms of waiting however narrow they are.
#[derive(Debug, Clone, sqlx::FromRow)]
struct StoryRow {
    uri: Option<String>,
    #[sqlx(rename = "ts")]
    timestamp: DateTime<Utc>,
    track_id: String,
    title: String,
    artist: String,
    album_artist: String,
    album: String,
    album_art: Option<String>,
    track_uri: Option<String>,
    artist_uri: Option<String>,
    album_uri: Option<String>,
    handle: String,
    did: String,
    avatar: String,
}

/// Row ids of the users `did` follows.
///
/// The same lookup the global feed does for its `following` parameter, which is
/// private to that module.
async fn followed_user_ids(db: &Backend, did: &str) -> Result<Vec<String>, sqlx::Error> {
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

/// A page of stories: the newest scrobble per listener, hydrated, in one
/// statement.
///
/// This is `getStories.ts`'s query, column for column —
///
/// ```sql
/// SELECT s.uri, s.timestamp, t.xata_id, t.title, …, ar.uri, al.uri, u.handle, …
/// FROM scrobbles s
/// LEFT JOIN artists ar ON s.artist_id = ar.xata_id
/// LEFT JOIN albums  al ON s.album_id  = al.xata_id
/// LEFT JOIN tracks  t  ON s.track_id  = t.xata_id
/// LEFT JOIN users   u  ON s.user_id   = u.xata_id
/// WHERE s.xata_id IN (<the newest scrobble per listener>)
/// ORDER BY s.timestamp DESC
/// LIMIT size
/// ```
///
/// — with one deliberate difference. The TypeScript writes the subquery as
/// `DISTINCT ON (user_id)`, which only Postgres has; [`latest_per_user_query`]
/// is the portable spelling of the same ranking, tie-break included.
///
/// The joins are LEFT, as upstream, so a scrobble whose album has not been
/// indexed still appears — it simply has no `albumUri`. `tracks` and `users`
/// are the exceptions the row struct enforces: a story with neither a title
/// nor a listener cannot be rendered, and the non-null columns make such a row
/// a decode error rather than a half-empty card.
fn stories_query(
    db: &Backend,
    genre: Option<&str>,
    followed: Option<&[String]>,
    since: Option<DateTime<Utc>>,
    size: i64,
) -> SelectStatement {
    let bounds = Bounds {
        before: None,
        after: since,
        listeners: followed,
        genre,
    };

    let s = Alias::new("s");
    let t = Alias::new("t");
    let u = Alias::new("u");
    let ar = Alias::new("ar");
    let al = Alias::new("al");

    let mut query = Query::select();
    query
        .expr_as(Expr::col((s.clone(), Scrobbles::Uri)), Alias::new("uri"))
        // Aliased away from `timestamp`: the row struct renames it, and two
        // tables in this join have a column by that name.
        .expr_as(
            Expr::col((s.clone(), Scrobbles::Timestamp)),
            Alias::new("ts"),
        )
        .expr_as(
            Expr::col((t.clone(), Tracks::XataId)),
            Alias::new("track_id"),
        )
        .expr_as(Expr::col((t.clone(), Tracks::Title)), Alias::new("title"))
        .expr_as(Expr::col((t.clone(), Tracks::Artist)), Alias::new("artist"))
        .expr_as(
            Expr::col((t.clone(), Tracks::AlbumArtist)),
            Alias::new("album_artist"),
        )
        .expr_as(Expr::col((t.clone(), Tracks::Album)), Alias::new("album"))
        .expr_as(
            Expr::col((t.clone(), Tracks::AlbumArt)),
            Alias::new("album_art"),
        )
        .expr_as(Expr::col((t.clone(), Tracks::Uri)), Alias::new("track_uri"))
        .expr_as(
            Expr::col((ar.clone(), Artists::Uri)),
            Alias::new("artist_uri"),
        )
        .expr_as(
            Expr::col((al.clone(), Albums::Uri)),
            Alias::new("album_uri"),
        )
        .expr_as(Expr::col((u.clone(), Users::Handle)), Alias::new("handle"))
        .expr_as(Expr::col((u.clone(), Users::Did)), Alias::new("did"))
        .expr_as(Expr::col((u.clone(), Users::Avatar)), Alias::new("avatar"))
        .from_as(Scrobbles::Table, s.clone())
        .join_as(
            JoinType::LeftJoin,
            Artists::Table,
            ar.clone(),
            Expr::col((s.clone(), Scrobbles::ArtistId)).equals((ar, Artists::XataId)),
        )
        .join_as(
            JoinType::LeftJoin,
            Albums::Table,
            al.clone(),
            Expr::col((s.clone(), Scrobbles::AlbumId)).equals((al, Albums::XataId)),
        )
        .join_as(
            JoinType::LeftJoin,
            Tracks::Table,
            t.clone(),
            Expr::col((s.clone(), Scrobbles::TrackId)).equals((t, Tracks::XataId)),
        )
        .join_as(
            JoinType::LeftJoin,
            Users::Table,
            u.clone(),
            Expr::col((s.clone(), Scrobbles::UserId)).equals((u, Users::XataId)),
        )
        .and_where(
            Expr::col((s.clone(), Scrobbles::XataId))
                .in_subquery(latest_per_user_query(db, bounds, size)),
        )
        .order_by((s, Scrobbles::Timestamp), Order::Desc)
        .limit(size as u64);
    query
}

/// Ranks each listener's scrobbles and keeps the newest, newest listener first.
///
/// `apps/api` writes this as `DISTINCT ON (user_id)`, which is Postgres-only.
/// The window function is the portable spelling of the same thing, tie-break
/// included, and SQLite has had it since 3.25.
fn latest_per_user_query(db: &Backend, bounds: Bounds<'_>, size: i64) -> SelectStatement {
    let mut ranked = Query::select();
    ranked
        .expr_as(
            Expr::col((Alias::new("s"), Scrobbles::XataId)),
            Alias::new("id"),
        )
        // Selected only so the outer query can order by it.
        .expr_as(
            Expr::col((Alias::new("s"), Scrobbles::Timestamp)),
            Alias::new("timestamp"),
        )
        .expr_window_as(
            Expr::cust("ROW_NUMBER()"),
            WindowStatement::partition_by((Alias::new("s"), Scrobbles::UserId))
                .order_by((Alias::new("s"), Scrobbles::Timestamp), Order::Desc)
                .order_by((Alias::new("s"), Scrobbles::XataId), Order::Desc)
                .take(),
            Alias::new("rank"),
        )
        .from_as(Scrobbles::Table, Alias::new("s"));
    apply_bounds(db, &mut ranked, bounds);

    Query::select()
        .column(Alias::new("id"))
        .from_subquery(ranked.take(), Alias::new("latest"))
        .and_where(Expr::col(Alias::new("rank")).eq(1))
        .order_by(Alias::new("timestamp"), Order::Desc)
        .limit(size as u64)
        .take()
}

// ------------------------------------------------------------- generators

/// `params.size || 100` in the TypeScript handler.
const GENERATORS_DEFAULT_SIZE: i64 = 100;

#[derive(Debug, Clone, Deserialize)]
pub struct GetFeedGeneratorParams {
    pub feed: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct GetFeedGeneratorsParams {
    #[serde(default)]
    pub size: Option<i64>,
}

/// Who published a feed generator record.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FeedCreatorView {
    pub id: String,
    pub did: String,
    pub handle: String,
    pub display_name: Option<String>,
    pub avatar: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FeedGeneratorView {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub avatar: Option<String>,
    /// The service that serves this feed. Not in the lexicon's
    /// `feedGeneratorView`, but the live response carries it and it is the only
    /// field naming where the feed comes from.
    pub did: String,
    pub uri: String,
    pub creator: Option<FeedCreatorView>,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct FeedGeneratorsOutput {
    pub feeds: Vec<FeedGeneratorView>,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct FeedGeneratorOutput {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub view: Option<FeedGeneratorView>,
}

/// A row of [`generator_columns`].
#[derive(Debug, Clone, sqlx::FromRow)]
struct FeedRow {
    id: String,
    name: String,
    description: Option<String>,
    did: String,
    uri: String,
    avatar: Option<String>,
    creator_id: Option<String>,
    creator_did: Option<String>,
    creator_handle: Option<String>,
    creator_display_name: Option<String>,
    creator_avatar: Option<String>,
}

impl From<FeedRow> for FeedGeneratorView {
    fn from(row: FeedRow) -> Self {
        // The three creator columns that are `NOT NULL` in `users` arrive
        // together or not at all, so one `Option` covers the profile. The join
        // is outer because `apps/api` has it that way; `feeds.user_id` is a
        // non-null foreign key, so in practice it always matches.
        let creator = match (row.creator_id, row.creator_did, row.creator_handle) {
            (Some(id), Some(did), Some(handle)) => Some(FeedCreatorView {
                id,
                did,
                handle,
                display_name: row.creator_display_name,
                avatar: row.creator_avatar.unwrap_or_default(),
            }),
            _ => None,
        };
        Self {
            id: row.id,
            name: row.name,
            description: row.description,
            avatar: row.avatar,
            did: row.did,
            uri: row.uri,
            creator,
        }
    }
}

/// Adds every column a generator view needs, aliased to [`FeedRow`]'s fields.
fn generator_columns(query: &mut SelectStatement) {
    let feed = |column| Expr::col((Alias::new("f"), column));
    let creator = |column| Expr::col((Alias::new("u"), column));

    query
        .expr_as(feed(Feeds::XataId), Alias::new("id"))
        .expr_as(feed(Feeds::DisplayName), Alias::new("name"))
        .expr(feed(Feeds::Description))
        .expr(feed(Feeds::Did))
        .expr(feed(Feeds::Uri))
        .expr(feed(Feeds::Avatar))
        .expr_as(creator(Users::XataId), Alias::new("creator_id"))
        .expr_as(creator(Users::Did), Alias::new("creator_did"))
        .expr_as(creator(Users::Handle), Alias::new("creator_handle"))
        .expr_as(
            creator(Users::DisplayName),
            Alias::new("creator_display_name"),
        )
        .expr_as(creator(Users::Avatar), Alias::new("creator_avatar"))
        .from_as(Feeds::Table, Alias::new("f"))
        .join_as(
            JoinType::LeftJoin,
            Users::Table,
            Alias::new("u"),
            Expr::col((Alias::new("u"), Users::XataId)).equals((Alias::new("f"), Feeds::UserId)),
        );
}

/// The registry, either in full or for one URI.
async fn load_generators(
    db: &Backend,
    uri: Option<&str>,
    limit: i64,
) -> Result<Vec<FeedGeneratorView>, sqlx::Error> {
    let mut query = Query::select();
    generator_columns(&mut query);
    if let Some(uri) = uri {
        query.and_where(Expr::col((Alias::new("f"), Feeds::Uri)).eq(uri));
    }
    query
        // `apps/api` orders this only by whatever the planner returns, which
        // makes its `size` a nondeterministic slice of the registry.
        .order_by((Alias::new("f"), Feeds::DisplayName), Order::Asc)
        .limit(limit as u64);

    Ok(db
        .fetch_all::<FeedRow>(&query)
        .await?
        .into_iter()
        .map(FeedGeneratorView::from)
        .collect())
}

/// `app.rocksky.feed.getFeedGenerator`
///
/// Answers `{}` for an unknown URI: the TypeScript handler indexes the first
/// row of an empty result and serializes the resulting `undefined` away.
async fn get_feed_generator(
    state: web::Data<AppState>,
    params: web::Query<GetFeedGeneratorParams>,
) -> XrpcResult<HttpResponse> {
    match load_generators(state.db(), Some(&params.feed), 1).await {
        Ok(views) => json(FeedGeneratorOutput {
            view: views.into_iter().next(),
        }),
        Err(err) => {
            tracing::error!(error = ?err, feed = %params.feed, "error retrieving a feed generator");
            json(FeedGeneratorOutput::default())
        }
    }
}

/// `app.rocksky.feed.getFeedGenerators`
async fn get_feed_generators(
    state: web::Data<AppState>,
    params: web::Query<GetFeedGeneratorsParams>,
) -> XrpcResult<HttpResponse> {
    let limit = clamp_limit_or(params.size, GENERATORS_DEFAULT_SIZE);
    match load_generators(state.db(), None, limit).await {
        Ok(feeds) => json(FeedGeneratorsOutput { feeds }),
        Err(err) => {
            tracing::error!(error = ?err, "error retrieving feed generators");
            json(FeedGeneratorsOutput::default())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sea_query::SqliteQueryBuilder;

    const ROCK: &str = "at://did:plc:pub/app.rocksky.feed.generator/rock";
    const ALL: &str = "at://did:plc:pub/app.rocksky.feed.generator/all";

    /// Two listeners, three scrobbles: two rock plays by alice and one
    /// unclassified play by bob, plus a feed generator record for each of the
    /// two feeds under test.
    async fn fixture() -> AppState {
        let state = AppState::for_test().await.unwrap();
        let db = state.db();

        for statement in [
            "INSERT INTO users (xata_id, did, handle, display_name, avatar) VALUES \
             ('rec_alice', 'did:plc:alice', 'alice.test', 'Alice', 'a'), \
             ('rec_bob', 'did:plc:bob', 'bob.test', NULL, 'b')",
            "INSERT INTO artists (xata_id, name, sha256, genres, uri) VALUES \
             ('rec_rock', 'Nirvana', 'sha-rock', '[\"grunge\",\"rock\"]', 'at://artist/rock'), \
             ('rec_other', 'Autechre', 'sha-other', '[\"electronic\"]', 'at://artist/other')",
            "INSERT INTO albums (xata_id, title, artist, sha256, uri) VALUES \
             ('rec_album', 'Nevermind', 'Nirvana', 'sha-album', 'at://album/nevermind')",
            "INSERT INTO tracks \
             (xata_id, title, artist, album_artist, album, duration, sha256, uri, album_art) VALUES \
             ('rec_t1', 'Lithium', 'Nirvana', 'Nirvana', 'Nevermind', 1, 'sha-t1', 'at://track/1', 'art-1'), \
             ('rec_t2', 'Amber', 'Autechre', 'Autechre', 'Amber', 2, 'sha-t2', 'at://track/2', NULL)",
            "INSERT INTO scrobbles (xata_id, user_id, track_id, album_id, artist_id, uri, timestamp) \
             VALUES \
             ('rec_s1', 'rec_alice', 'rec_t1', 'rec_album', 'rec_rock', 'at://1', '2026-01-01T00:00:00.000Z'), \
             ('rec_s2', 'rec_bob', 'rec_t2', NULL, 'rec_other', 'at://2', '2026-01-02T00:00:00.000Z'), \
             ('rec_s3', 'rec_alice', 'rec_t1', 'rec_album', 'rec_rock', 'at://3', '2026-01-03T00:00:00.000Z')",
            "INSERT INTO follows (xata_id, uri, follower_did, subject_did) VALUES \
             ('rec_f1', 'at://f1', 'did:plc:alice', 'did:plc:bob')",
            "INSERT INTO feeds (xata_id, display_name, description, did, uri, avatar, user_id) VALUES \
             ('rec_feed_rock', 'Rock', 'Guitars', 'did:web:feeds.test', \
              'at://did:plc:pub/app.rocksky.feed.generator/rock', 'rock.png', 'rec_alice'), \
             ('rec_feed_all', 'All', NULL, 'did:web:feeds.test', \
              'at://did:plc:pub/app.rocksky.feed.generator/all', NULL, 'rec_alice')",
        ] {
            db.execute(&db.sql(statement)).await.unwrap();
        }

        state
    }

    fn stories_params() -> GetStoriesParams {
        GetStoriesParams {
            size: None,
            feed: None,
            following: None,
        }
    }

    #[test]
    fn a_feed_uri_resolves_to_its_algorithm() {
        assert_eq!(algorithm(ALL), Some(Algorithm::All));
        assert_eq!(algorithm(ROCK), Some(Algorithm::Genre("rock")));
        // The record key is not the genre for every feed.
        assert_eq!(
            algorithm("at://did:plc:pub/app.rocksky.feed.generator/rnb"),
            Some(Algorithm::Genre("r&b"))
        );
        assert_eq!(
            algorithm("at://did:plc:pub/app.rocksky.feed.generator/hip-hop"),
            Some(Algorithm::Genre("hip hop"))
        );
        // Any publisher DID serves; see `algorithm`.
        assert_eq!(
            algorithm("at://did:web:someone.else/app.rocksky.feed.generator/jazz"),
            Some(Algorithm::Genre("jazz"))
        );
    }

    #[test]
    fn a_uri_that_is_not_a_feed_generator_resolves_to_nothing() {
        for uri in [
            "",
            "rock",
            "at://",
            "at://did:plc:pub",
            "at://did:plc:pub/app.rocksky.feed.generator",
            // A collection that is not the generator's.
            "at://did:plc:pub/app.rocksky.scrobble/rock",
            // An algorithm this instance does not have.
            "at://did:plc:pub/app.rocksky.feed.generator/trending",
            // A record key with a path in it.
            "at://did:plc:pub/app.rocksky.feed.generator/rock/extra",
            "https://example.test/app.rocksky.feed.generator/rock",
        ] {
            assert!(algorithm(uri).is_none(), "{uri:?} should not resolve");
        }
    }

    /// The table is the port of `apps/feeds/src/algos`, which has 52 entries:
    /// `all` plus 51 genres.
    #[test]
    fn the_genre_table_holds_one_unique_key_per_feed() {
        assert_eq!(GENRE_FEEDS.len(), 51);

        let mut keys: Vec<&str> = GENRE_FEEDS.iter().map(|(key, _)| *key).collect();
        keys.sort_unstable();
        let unique = keys.len();
        keys.dedup();
        assert_eq!(keys.len(), unique, "two feeds share a record key");
        assert!(
            !keys.contains(&ALL_FEED),
            "`all` is not a genre and must not be in the table"
        );
    }

    #[tokio::test]
    async fn the_feed_reads_newest_first_and_breaks_ties_by_id() {
        let db = crate::db::connect_in_memory().await.unwrap();
        let sql = scrobble_page(&db, Bounds::default(), 50).to_string(SqliteQueryBuilder);

        assert!(
            sql.contains(r#"ORDER BY "s"."timestamp" DESC, "s"."xata_id" DESC"#),
            "{sql}"
        );
        assert!(sql.contains("LIMIT 50"), "{sql}");
        // No bounds means no clauses at all, not clauses that happen to be wide.
        assert!(!sql.contains("WHERE"), "{sql}");
    }

    #[tokio::test]
    async fn the_bounds_are_all_applied_as_the_backend_needs_them() {
        let db = crate::db::connect_in_memory().await.unwrap();
        let at = parse_cursor("1767225600000").expect("parses");
        let listeners = ["rec_alice".to_string(), "rec_bob".to_string()];
        let sql = scrobble_page(
            &db,
            Bounds {
                before: Some(at),
                after: Some(at),
                listeners: Some(&listeners),
                genre: Some("rock"),
            },
            50,
        )
        .to_string(SqliteQueryBuilder);

        // Both ends as ISO text, which is how SQLite holds the column.
        assert!(
            sql.contains(r#""s"."timestamp" < '2026-01-01T00:00:00.000Z'"#),
            "{sql}"
        );
        assert!(
            sql.contains(r#""s"."timestamp" > '2026-01-01T00:00:00.000Z'"#),
            "{sql}"
        );
        assert!(
            sql.contains(r#""s"."user_id" IN ('rec_alice', 'rec_bob')"#),
            "{sql}"
        );
        // The genre is a predicate on a joined `artists`, not a filter applied
        // to rows already fetched.
        assert!(sql.contains(r#"INNER JOIN "artists" AS "a""#), "{sql}");
        assert!(sql.contains("json_each(a.genres)"), "{sql}");
    }

    /// The whole point of the join: the database returns the page, so no
    /// scrobble is read only to be discarded in Rust.
    ///
    /// The previous implementation walked up to five pages of two hundred rows
    /// and loaded each page's artists to test them — ten round trips against a
    /// database that costs 95 ms before it does any work — and for a rare
    /// genre still came back short, because the scan budget ran out before the
    /// rows did.
    #[tokio::test]
    async fn a_genre_feed_is_one_statement_with_the_limit_in_it() {
        let db = crate::db::connect_in_memory().await.unwrap();
        let sql = scrobble_page(&db, Bounds::before(None).genre(Some("r&b")), 20)
            .to_string(SqliteQueryBuilder);

        assert!(sql.contains("LIMIT 20"), "{sql}");
        assert!(sql.contains(r#"ORDER BY "s"."timestamp" DESC"#), "{sql}");
        // One statement: the only nested SELECT is the containment test, which
        // the planner evaluates per row rather than as a second trip.
        assert_eq!(sql.matches("FROM \"scrobbles\"").count(), 1, "{sql}");
    }

    /// The genre reaches the statement as a bound value.
    ///
    /// `rnb` filters on the literal `r&b`, and two of the feeds carry an
    /// apostrophe-free but still punctuated name; a genre spliced into the SQL
    /// would be one quote away from a broken statement.
    #[tokio::test]
    async fn the_genre_is_a_bound_parameter() {
        use crate::sea_query::SqliteQueryBuilder;
        let db = crate::db::connect_in_memory().await.unwrap();
        let (sql, values) = scrobble_page(&db, Bounds::before(None).genre(Some("r&b")), 20)
            .build(SqliteQueryBuilder);

        assert!(sql.contains("json_each.value = ?"), "{sql}");
        assert!(
            values.iter().any(|v| format!("{v:?}").contains("r&b")),
            "the genre should be bound, not spliced: {values:?}"
        );
    }

    /// No genre must leave the statement exactly as it was — the everything
    /// feed does not pay for a join it has no use for.
    #[tokio::test]
    async fn the_everything_feed_does_not_join_artists() {
        let db = crate::db::connect_in_memory().await.unwrap();
        let sql = scrobble_page(&db, Bounds::before(None), 20).to_string(SqliteQueryBuilder);
        assert!(!sql.contains("artists"), "{sql}");
    }

    #[test]
    fn an_unusable_cursor_reads_as_absent() {
        for cursor in ["", "  ", "not-a-number", "1.5", "-", "٣"] {
            assert!(
                parse_cursor(cursor).is_none(),
                "{cursor:?} should not parse"
            );
        }
        assert!(parse_cursor(" 1767225600000 ").is_some());
    }

    /// The window function, its partition and its tie-break, asserted on the
    /// rendered statement: on SQLite an unsupported window silently becomes a
    /// runtime error, and the tie-break is what makes the ranking stable.
    #[tokio::test]
    async fn the_latest_per_user_query_keeps_one_row_per_user() {
        let db = crate::db::connect_in_memory().await.unwrap();
        let sql = latest_per_user_query(&db, Bounds::default(), 20).to_string(SqliteQueryBuilder);

        let window = concat!(
            r#"ROW_NUMBER() OVER ( PARTITION BY "s"."user_id" "#,
            r#"ORDER BY "s"."timestamp" DESC, "s"."xata_id" DESC )"#
        );
        assert!(sql.contains(window), "{sql}");
        assert!(sql.contains(r#""rank" = 1"#), "{sql}");
        assert!(sql.contains(r#"ORDER BY "timestamp" DESC"#), "{sql}");
        assert!(sql.contains("LIMIT 20"), "{sql}");
    }

    /// The recent window narrows the ranking itself, not the rows it returns:
    /// bounding the outer query instead would rank over everything and then
    /// throw most of it away.
    #[tokio::test]
    async fn the_stories_window_bounds_the_ranking() {
        let db = crate::db::connect_in_memory().await.unwrap();

        let since = DateTime::from_timestamp_millis(1_767_225_600_000).unwrap();
        let sql = latest_per_user_query(
            &db,
            Bounds {
                after: Some(since),
                ..Bounds::default()
            },
            20,
        )
        .to_string(SqliteQueryBuilder);

        let (ranking, page) = sql
            .rsplit_once(") AS \"latest\"")
            .expect("the ranking is a subquery");
        assert!(
            ranking.contains(r#""s"."timestamp" > '2026-01-01T00:00:00.000Z'"#),
            "{sql}"
        );
        assert!(!page.contains("timestamp\" >"), "{sql}");
    }

    #[tokio::test]
    async fn the_all_feed_returns_every_scrobble_newest_first() {
        let state = fixture().await;

        let page = load_page(&state, Algorithm::All, 50, None, None)
            .await
            .unwrap();

        let ids: Vec<&str> = page.scrobbles.iter().map(|s| s.id.as_str()).collect();
        assert_eq!(ids, ["rec_s3", "rec_s2", "rec_s1"]);
        // A short page carries no cursor, so a caller looping stops here.
        assert!(page.cursor.is_none());
    }

    #[tokio::test]
    async fn a_genre_feed_returns_only_that_genre() {
        let state = fixture().await;

        let page = load_page(&state, Algorithm::Genre("rock"), 50, None, None)
            .await
            .unwrap();

        let ids: Vec<&str> = page.scrobbles.iter().map(|s| s.id.as_str()).collect();
        assert_eq!(ids, ["rec_s3", "rec_s1"], "bob's play is not rock");

        // A genre nobody carries is empty rather than unfiltered.
        let page = load_page(&state, Algorithm::Genre("k-pop"), 50, None, None)
            .await
            .unwrap();
        assert!(page.scrobbles.is_empty());
        assert!(page.cursor.is_none(), "an exhausted walk reports no cursor");
    }

    /// A genre page that fills stops at the row it last reported, not at the
    /// row it last examined — the rows in between are rejected but the ones
    /// after them have not been offered to the client yet.
    #[tokio::test]
    async fn a_genre_page_resumes_where_it_stopped_reporting() {
        let state = fixture().await;

        let first = load_page(&state, Algorithm::Genre("rock"), 1, None, None)
            .await
            .unwrap();
        assert_eq!(first.scrobbles[0].id, "rec_s3");
        let cursor = first.cursor.expect("a full page reports a cursor");
        assert_eq!(cursor, "1767398400000", "the row it reported, not bob's");

        // The walk passes over bob's play and reaches alice's older one.
        let second = load_page(&state, Algorithm::Genre("rock"), 1, Some(&cursor), None)
            .await
            .unwrap();
        assert_eq!(second.scrobbles[0].id, "rec_s1");

        // A full page always reports a cursor, so the feed ends with one empty
        // request rather than a guess.
        let third = load_page(
            &state,
            Algorithm::Genre("rock"),
            1,
            second.cursor.as_deref(),
            None,
        )
        .await
        .unwrap();
        assert!(third.scrobbles.is_empty());
        assert!(third.cursor.is_none());
    }

    /// A full page reports a cursor, and following it returns the next rows
    /// without repeating the ones already seen.
    #[tokio::test]
    async fn the_cursor_walks_the_feed_without_overlap() {
        let state = fixture().await;

        let first = load_page(&state, Algorithm::All, 2, None, None)
            .await
            .unwrap();
        assert_eq!(
            first
                .scrobbles
                .iter()
                .map(|s| s.id.as_str())
                .collect::<Vec<_>>(),
            ["rec_s3", "rec_s2"]
        );
        let cursor = first.cursor.expect("a full page reports a cursor");
        // The oldest row of the page, in epoch milliseconds.
        assert_eq!(cursor, "1767312000000");

        let second = load_page(&state, Algorithm::All, 2, Some(&cursor), None)
            .await
            .unwrap();
        assert_eq!(
            second
                .scrobbles
                .iter()
                .map(|s| s.id.as_str())
                .collect::<Vec<_>>(),
            ["rec_s1"]
        );
        assert!(second.cursor.is_none(), "the feed is exhausted");
    }

    /// `feedView` is `{ feed: [{ scrobble }], cursor? }`, and each `scrobble`
    /// is the same view the global feed returns.
    #[tokio::test]
    async fn the_feed_view_wraps_each_scrobble() {
        let state = fixture().await;

        let page = load_page(&state, Algorithm::All, 1, None, None)
            .await
            .unwrap();
        let output = FeedOutput {
            feed: page
                .scrobbles
                .into_iter()
                .map(|scrobble| FeedItemView { scrobble })
                .collect(),
            cursor: page.cursor,
        };

        let value = serde_json::to_value(&output).unwrap();
        assert!(value["feed"].is_array());
        assert!(value["cursor"].is_string());
        let scrobble = &value["feed"][0]["scrobble"];
        assert_eq!(scrobble["id"], "rec_s3");
        assert_eq!(scrobble["title"], "Lithium");
        assert_eq!(scrobble["cover"], "art-1");
        assert_eq!(scrobble["user"], "alice.test");
        assert_eq!(scrobble["trackUri"], "at://track/1");
        assert_eq!(scrobble["tags"][1], "rock");
        assert_eq!(scrobble["likesCount"], 0);
        assert_eq!(scrobble["liked"], false);
    }

    #[tokio::test]
    async fn the_cache_key_matches_the_typescript_shape() {
        let params = GetFeedParams {
            feed: ROCK.into(),
            limit: Some(10),
            cursor: Some("1767225600000".into()),
        };
        assert_eq!(
            feed_cache_key(&params, Some("7".into()), Some("did:plc:alice")),
            format!("feed:getFeed:v2:did:plc:alice:{ROCK}:7:10:1767225600000")
        );

        let anonymous = GetFeedParams {
            feed: ROCK.into(),
            limit: None,
            cursor: None,
        };
        // `did ?? "anon"`, version `0`, then one empty segment each for limit
        // and cursor — so two trailing colons.
        assert_eq!(
            feed_cache_key(&anonymous, None, None),
            format!("feed:getFeed:v2:anon:{ROCK}:0::")
        );
    }

    #[tokio::test]
    async fn stories_report_the_newest_scrobble_per_user() {
        let state = fixture().await;

        let stories = load_stories(&state, &stories_params(), None).await.unwrap();

        // One story each, the listener who played most recently first, and
        // alice's own older play is not among them.
        assert_eq!(stories.len(), 2);
        assert_eq!(stories[0].handle, "alice.test");
        assert_eq!(stories[0].uri.as_deref(), Some("at://3"));
        assert_eq!(stories[1].handle, "bob.test");
    }

    /// The whole `storyView`, against the lexicon's field names.
    #[tokio::test]
    async fn a_story_carries_the_fields_the_lexicon_declares() {
        let state = fixture().await;

        let stories = load_stories(&state, &stories_params(), Some("did:plc:alice"))
            .await
            .unwrap();
        let story = serde_json::to_value(
            stories
                .iter()
                .find(|story| story.handle == "alice.test")
                .expect("alice has a story"),
        )
        .unwrap();

        for key in [
            "album",
            "albumArt",
            "albumArtist",
            "albumUri",
            "artist",
            "artistUri",
            "avatar",
            "createdAt",
            "did",
            "handle",
            "id",
            "title",
            "trackId",
            "trackUri",
            "uri",
        ] {
            assert!(story.get(key).is_some(), "storyView has no {key}");
        }
        assert_eq!(story["album"], "Nevermind");
        assert_eq!(story["albumUri"], "at://album/nevermind");
        assert_eq!(story["artistUri"], "at://artist/rock");
        assert_eq!(story["createdAt"], "2026-01-03T00:00:00.000Z");
        // The story's id is the track's, not the scrobble's.
        assert_eq!(story["id"], "rec_t1");
        assert_eq!(story["trackId"], "rec_t1");
        // And the like state the UI reads, which is not in the lexicon.
        assert_eq!(story["liked"], false);
        assert_eq!(story["likesCount"], 0);
    }

    #[tokio::test]
    async fn stories_can_be_restricted_to_a_feed_or_to_the_people_followed() {
        let state = fixture().await;

        let rock = GetStoriesParams {
            feed: Some(ROCK.into()),
            ..stories_params()
        };
        let stories = load_stories(&state, &rock, None).await.unwrap();
        assert_eq!(stories.len(), 1, "only alice is listening to rock");
        assert_eq!(stories[0].handle, "alice.test");

        // Alice follows bob and not herself.
        let following = GetStoriesParams {
            following: Some(true),
            ..stories_params()
        };
        let stories = load_stories(&state, &following, Some("did:plc:alice"))
            .await
            .unwrap();
        assert_eq!(stories.len(), 1);
        assert_eq!(stories[0].handle, "bob.test");

        // A feed this instance cannot serve selects nothing rather than
        // everything.
        let unknown = GetStoriesParams {
            feed: Some("at://did:plc:pub/app.rocksky.feed.generator/trending".into()),
            ..stories_params()
        };
        assert!(load_stories(&state, &unknown, None)
            .await
            .unwrap()
            .is_empty());
    }

    #[tokio::test]
    async fn stories_honour_the_size_and_its_cap() {
        let state = fixture().await;

        let one = GetStoriesParams {
            size: Some(1),
            ..stories_params()
        };
        assert_eq!(load_stories(&state, &one, None).await.unwrap().len(), 1);

        // Nonsense reads as absent, as everywhere else.
        let silly = GetStoriesParams {
            size: Some(-5),
            ..stories_params()
        };
        assert_eq!(load_stories(&state, &silly, None).await.unwrap().len(), 2);
    }

    #[tokio::test]
    async fn the_generator_registry_lists_the_feeds_with_their_creator() {
        let state = fixture().await;

        let feeds = load_generators(state.db(), None, GENERATORS_DEFAULT_SIZE)
            .await
            .unwrap();
        let value = serde_json::to_value(FeedGeneratorsOutput { feeds }).unwrap();

        assert_eq!(value["feeds"].as_array().unwrap().len(), 2);
        // Ordered by name, which `apps/api` leaves to the planner.
        assert_eq!(value["feeds"][0]["name"], "All");
        let rock = &value["feeds"][1];
        assert_eq!(rock["id"], "rec_feed_rock");
        assert_eq!(rock["name"], "Rock");
        assert_eq!(rock["description"], "Guitars");
        assert_eq!(rock["avatar"], "rock.png");
        assert_eq!(rock["did"], "did:web:feeds.test");
        assert_eq!(rock["uri"], ROCK);
        assert_eq!(rock["creator"]["did"], "did:plc:alice");
        assert_eq!(rock["creator"]["handle"], "alice.test");
        assert_eq!(rock["creator"]["displayName"], "Alice");
        assert_eq!(rock["creator"]["avatar"], "a");
        // `null` rather than a missing key where the column is NULL.
        assert!(value["feeds"][0]["description"].is_null());
    }

    #[tokio::test]
    async fn one_generator_is_addressed_by_uri_and_missing_ones_answer_nothing() {
        let state = fixture().await;

        let view = load_generators(state.db(), Some(ROCK), 1)
            .await
            .unwrap()
            .into_iter()
            .next();
        let value = serde_json::to_value(FeedGeneratorOutput { view }).unwrap();
        assert_eq!(value["view"]["uri"], ROCK);

        // An unregistered URI serializes as `{}`, which is what the live API
        // answers.
        let missing = load_generators(state.db(), Some("at://nope"), 1)
            .await
            .unwrap();
        let value = serde_json::to_value(FeedGeneratorOutput {
            view: missing.into_iter().next(),
        })
        .unwrap();
        assert_eq!(value, serde_json::json!({}));
    }

    #[test]
    fn the_generator_listing_caps_its_size_and_outer_joins_the_creator() {
        let mut query = Query::select();
        generator_columns(&mut query);
        query.limit(clamp_limit_or(Some(10_000), GENERATORS_DEFAULT_SIZE) as u64);
        let sql = query.to_string(SqliteQueryBuilder);

        assert!(sql.contains("LIMIT 100"), "{sql}");
        assert!(
            sql.contains(r#"LEFT JOIN "users" AS "u""#),
            "the creator must not be required to render a feed: {sql}"
        );
    }

    #[test]
    fn params_deserialize_from_a_query_string() {
        let params: GetFeedParams =
            serde_urlencoded::from_str("feed=at%3A%2F%2Fa%2Fb%2Fc&limit=5").unwrap();
        assert_eq!(params.feed, "at://a/b/c");
        assert_eq!(params.limit, Some(5));
        assert_eq!(params.cursor, None);

        let params: GetStoriesParams =
            serde_urlencoded::from_str("size=10&following=true").unwrap();
        assert_eq!(params.size, Some(10));
        assert_eq!(params.following, Some(true));

        let params: GetFeedGeneratorsParams = serde_urlencoded::from_str("size=4").unwrap();
        assert_eq!(params.size, Some(4));
    }
}
