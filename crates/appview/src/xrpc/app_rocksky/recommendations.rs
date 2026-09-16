//! `app.rocksky.feed.getRecommendations`, `getAlbumRecommendations` and
//! `getArtistRecommendations` — what to listen to next.
//!
//! # Two paths, and only one of them is meant to run
//!
//! With `drift_url` configured, all three answer from drift's precomputed
//! snapshot (`drift/README.md`): one `GET /v1/recommendations…` with a three
//! second budget, whose rows are already `recommendationView`-shaped and are
//! passed through unchanged. Drift recomputes every listener's set on a
//! schedule, which is the only reason these endpoints are cheap.
//!
//! The per-request pipelines below are the fallback for when drift is
//! unreachable or was never configured. They are expensive — a dozen round
//! trips and, in the thin-pool case, a random sample of the artist table — and
//! exist so a fresh self-hosted instance recommends *something* rather than
//! nothing.
//!
//! # How a score is built
//!
//! Neighbours are the people who have played the most of the same artists.
//! Each neighbour carries a similarity in [0,1] — shared artists as a fraction
//! of the listener's own artist count — and each of their plays carries a
//! recency weight `exp(-0.02 · days)`, so a play from last week counts about
//! ten times a play from a year ago. `similarity × decayed plays` is the
//! score, times five when the neighbour explicitly loved the track.
//!
//! Everything is then filtered against the listener's genre profile. That
//! filter is strict on purpose: an unverifiable candidate (no artist genre
//! data) is dropped rather than shown, because one wrong genre in a
//! recommendation feed reads as the feature being broken.
//!
//! # Where this port diverges from `apps/api`
//!
//! | Upstream                     | Here                      | Why                       |
//! |------------------------------|---------------------------|---------------------------|
//! | decayed `sum(exp(…))` in SQL | decay folded in Rust      | no portable `exp`/epoch   |
//! | `genres @> ARRAY[…]` filter  | genre match in Rust       | no SQLite `text[]`        |
//! | genre weights, every artist  | the top 200 by plays      | the tail cannot reach 5 % |
//! | neighbours, no tiebreak      | ties broken by id         | an untied `LIMIT` churns  |
//! | exclusions bound in full     | capped, exact set in Rust | Postgres caps parameters  |
//! | an `Effect` cache per method | [`crate::cache`], 5 min   | the house pattern         |
//!
//! Each of these is explained where it happens — see
//! [`recent_scrobbles_query`], [`sample_artists`] and [`EXCLUDE_CAP`].

use crate::db::loaders::{albums_by_id, artists_by_id, tracks_by_id};
use crate::db::models::{Artist, ARTIST_COLS};
use crate::db::schema::{Albums, Artists, LovedTracks, Scrobbles, Tracks, UserArtists, Users};
use crate::db::{format_timestamp, Backend};
use crate::error::XrpcResult;
use crate::sea_query::{Alias, Expr, Func, JoinType, Order, Query, SelectStatement};
use crate::state::AppState;
use crate::xrpc::{clamp_limit_or, json};
use crate::xrpc_query;
use actix_web::web::{self, ServiceConfig};
use actix_web::HttpResponse;
use chrono::{DateTime, Duration as ChronoDuration, Utc};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::time::Duration;

pub fn configure(cfg: &mut ServiceConfig) {
    xrpc_query!(
        cfg,
        "app.rocksky.feed.getRecommendations",
        get_recommendations
    );
    xrpc_query!(
        cfg,
        "app.rocksky.feed.getAlbumRecommendations",
        get_album_recommendations
    );
    xrpc_query!(
        cfg,
        "app.rocksky.feed.getArtistRecommendations",
        get_artist_recommendations
    );
}

/// Recommendations returned when the caller does not say.
const RESULT_LIMIT: i64 = 50;

/// Neighbours whose taste is mined for candidates.
const NEIGHBOUR_LIMIT: u64 = 50;

/// Share of the result set given to discovery rather than to the best score.
const SERENDIPITY_RATIO: f64 = 0.15;

/// Recency decay, per day. At 0.02 a play loses half its weight in 35 days.
const DECAY_LAMBDA: f64 = 0.02;

/// How far back the decay is computed.
///
/// Anything older weighs less than `e^-7.3` ≈ 0.0007 and cannot move a
/// ranking, so the horizon costs nothing in fidelity and is what keeps the
/// fallback's row fetches bounded.
const DECAY_HORIZON_DAYS: i64 = 365;

/// Scrobble rows any one decay fetch will read, most recent first.
///
/// Fifty neighbours with long histories would otherwise pull the whole table
/// into memory. Truncating by recency truncates the rows that matter least.
const DECAY_ROW_CAP: u64 = 50_000;

/// Artists and albums considered from a listener's own history.
const PROFILE_LIMIT: u64 = 200;

/// Genres kept in a taste profile, and the share of listening a genre needs to
/// earn a place in it.
const GENRE_PROFILE_SIZE: usize = 10;
const GENRE_PROFILE_FLOOR: f64 = 0.05;

/// Weight a loved track lends its artist's genres — an explicit endorsement,
/// worth more than a play.
const LOVED_GENRE_WEIGHT: f64 = 50.0;

/// Multiplier on a candidate a neighbour has loved rather than merely played.
const LOVED_BOOST: f64 = 5.0;

/// Ids bound into a single `NOT IN`.
///
/// Upstream caps some of these at 500 and passes others in full; the
/// uncapped ones are a latent failure, since Postgres refuses a statement with
/// more than 65535 parameters and a heavy listener has tens of thousands of
/// heard tracks. Capped uniformly here — the Rust-side set is what actually
/// guarantees the exclusion, which is what upstream's own comment says.
const EXCLUDE_CAP: usize = 500;

/// Artists read in the catalogue-wide random sample that backfills a thin
/// pool. Sampled unfiltered and matched on genre in Rust, so the yield is a
/// fraction of this.
const SAMPLE_CAP: u64 = 2_000;

/// Neighbour artists considered for the serendipity slots.
const SERENDIPITY_ARTIST_LIMIT: u64 = 150;

/// Drift's budget. Past this the page is better off with the fallback.
const DRIFT_TIMEOUT: Duration = Duration::from_secs(3);

/// Matches the TTL of the `Cache.make` the TypeScript handlers wrap these in.
const CACHE_TTL: Duration = Duration::from_secs(300);

/// Compilation credits are not a taste: nearly every listener has one, so
/// recommending from them recommends noise.
const VARIOUS_ARTISTS: &str = "various artists";

#[derive(Debug, Clone, Deserialize)]
pub struct RecommendationParams {
    /// A DID or a handle — upstream resolves either.
    pub did: String,
    #[serde(default)]
    pub limit: Option<i64>,
}

// ------------------------------------------------------------------- views

/// `app.rocksky.feed.defs#recommendationView`.
///
/// `recommendationScore` is a `f64` here, not the `integer` the lexicon
/// declares: every real score is a fraction well below one, so an integer
/// field would report the whole feed as zero. Both `apps/api` and drift emit a
/// float, so the lexicon is what is wrong.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecommendationView {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub artist: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub album: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub album_art: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub track_uri: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub artist_uri: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub album_uri: Option<String>,
    #[serde(default)]
    pub genres: Vec<String>,
    #[serde(default)]
    pub recommendation_score: f64,
    #[serde(default)]
    pub source: String,
    #[serde(default)]
    pub likes_count: i64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct RecommendationsOutput {
    pub recommendations: Vec<RecommendationView>,
}

/// `app.rocksky.feed.defs#recommendedAlbumView`.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecommendedAlbumView {
    pub id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub uri: Option<String>,
    pub title: String,
    pub artist: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub artist_uri: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub year: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub album_art: Option<String>,
    #[serde(default)]
    pub recommendation_score: f64,
    #[serde(default)]
    pub source: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct RecommendedAlbumsOutput {
    pub albums: Vec<RecommendedAlbumView>,
}

/// `app.rocksky.feed.defs#recommendedArtistView`.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecommendedArtistView {
    pub id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub uri: Option<String>,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub picture: Option<String>,
    #[serde(default)]
    pub genres: Vec<String>,
    #[serde(default)]
    pub recommendation_score: f64,
    #[serde(default)]
    pub source: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct RecommendedArtistsOutput {
    pub artists: Vec<RecommendedArtistView>,
}

// ---------------------------------------------------------------- handlers

/// `app.rocksky.feed.getRecommendations`
async fn get_recommendations(
    state: web::Data<AppState>,
    params: web::Query<RecommendationParams>,
) -> XrpcResult<HttpResponse> {
    let limit = clamp_limit_or(params.limit, RESULT_LIMIT);
    let key = cache_key("tracks", &params.did, limit);

    if let Some(cached) = state.cache().get_json::<RecommendationsOutput>(&key).await {
        return json(cached);
    }

    if let Some(output) = from_drift::<RecommendationsOutput>(&state, "", &params.did, limit).await
    {
        cache(&state, &key, &output, output.recommendations.is_empty()).await;
        return json(output);
    }

    let output = match track_fallback(&state, &params.did, limit).await {
        Ok(output) => output,
        Err(err) => {
            // Empty rather than a 500: these are one panel on a page, and
            // failing the request breaks the page around them.
            tracing::error!(error = ?err, did = %params.did, "track recommendations failed");
            RecommendationsOutput::default()
        }
    };

    cache(&state, &key, &output, output.recommendations.is_empty()).await;
    json(output)
}

/// `app.rocksky.feed.getAlbumRecommendations`
async fn get_album_recommendations(
    state: web::Data<AppState>,
    params: web::Query<RecommendationParams>,
) -> XrpcResult<HttpResponse> {
    let limit = clamp_limit_or(params.limit, RESULT_LIMIT);
    let key = cache_key("albums", &params.did, limit);

    if let Some(cached) = state
        .cache()
        .get_json::<RecommendedAlbumsOutput>(&key)
        .await
    {
        return json(cached);
    }

    if let Some(output) =
        from_drift::<RecommendedAlbumsOutput>(&state, "/albums", &params.did, limit).await
    {
        cache(&state, &key, &output, output.albums.is_empty()).await;
        return json(output);
    }

    let output = match album_fallback(&state, &params.did, limit).await {
        Ok(output) => output,
        Err(err) => {
            tracing::error!(error = ?err, did = %params.did, "album recommendations failed");
            RecommendedAlbumsOutput::default()
        }
    };

    cache(&state, &key, &output, output.albums.is_empty()).await;
    json(output)
}

/// `app.rocksky.feed.getArtistRecommendations`
async fn get_artist_recommendations(
    state: web::Data<AppState>,
    params: web::Query<RecommendationParams>,
) -> XrpcResult<HttpResponse> {
    let limit = clamp_limit_or(params.limit, RESULT_LIMIT);
    let key = cache_key("artists", &params.did, limit);

    if let Some(cached) = state
        .cache()
        .get_json::<RecommendedArtistsOutput>(&key)
        .await
    {
        return json(cached);
    }

    if let Some(output) =
        from_drift::<RecommendedArtistsOutput>(&state, "/artists", &params.did, limit).await
    {
        cache(&state, &key, &output, output.artists.is_empty()).await;
        return json(output);
    }

    let output = match artist_fallback(&state, &params.did, limit).await {
        Ok(output) => output,
        Err(err) => {
            tracing::error!(error = ?err, did = %params.did, "artist recommendations failed");
            RecommendedArtistsOutput::default()
        }
    };

    cache(&state, &key, &output, output.artists.is_empty()).await;
    json(output)
}

pub fn cache_key(kind: &str, did: &str, limit: i64) -> String {
    format!("recommendations:{kind}:v1:{did}:{limit}")
}

/// Stores a rendered answer, unless it is empty.
///
/// An empty set is usually a transient failure — drift down, or a pipeline
/// that errored — and caching it would keep the panel blank for five minutes
/// after the cause is gone.
async fn cache<T: Serialize>(state: &AppState, key: &str, output: &T, is_empty: bool) {
    if !is_empty {
        state.cache().set_json(key, CACHE_TTL, output).await;
    }
}

// ------------------------------------------------------------------- drift

/// Drift's answer, or `None` when it is not configured or did not answer in
/// time. Either way the caller falls through to the pipeline.
async fn from_drift<T: serde::de::DeserializeOwned>(
    state: &AppState,
    path: &str,
    did: &str,
    limit: i64,
) -> Option<T> {
    let base = state.config().drift_url.as_deref()?.trim_end_matches('/');

    let response = state
        .http()
        .get(format!("{base}/v1/recommendations{path}"))
        .query(&[("did", did), ("limit", &limit.to_string())])
        .timeout(DRIFT_TIMEOUT)
        .send()
        .await;

    let response = match response {
        Ok(response) if response.status().is_success() => response,
        Ok(response) => {
            tracing::warn!(status = %response.status(), path, "drift refused the request");
            return None;
        }
        Err(err) => {
            tracing::warn!(error = %err, path, "drift unreachable, using the fallback");
            return None;
        }
    };

    match response.json::<T>().await {
        Ok(body) => Some(body),
        Err(err) => {
            tracing::warn!(error = %err, path, "drift answered an unreadable body");
            None
        }
    }
}

// ------------------------------------------------------- track pipeline

/// Where a candidate came from, as the lexicon spells it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Source {
    Neighbour,
    Social,
    Serendipity,
    KnownArtist,
    NewArtist,
}

impl Source {
    fn as_str(self) -> &'static str {
        match self {
            Self::Neighbour => "neighbour",
            Self::Social => "social",
            Self::Serendipity => "serendipity",
            Self::KnownArtist => "known-artist",
            Self::NewArtist => "new-artist",
        }
    }
}

/// One scored candidate, before it is hydrated into a view.
#[derive(Debug, Clone)]
struct Candidate {
    id: String,
    score: f64,
    source: Source,
}

async fn track_fallback(
    state: &AppState,
    did: &str,
    limit: i64,
) -> anyhow::Result<RecommendationsOutput> {
    let db = state.db().reads_may_lag();

    let Some(user_id) = find_user_id(&db, did).await? else {
        return Ok(RecommendationsOutput::default());
    };

    let serendipity_count = (limit as f64 * SERENDIPITY_RATIO).ceil() as usize;
    let main_count = limit as usize - serendipity_count;

    // Scrobbled and loved both count as "already known".
    let loved = loved_track_ids(&db, &user_id).await?;
    let mut heard: HashSet<String> = heard_ids(&db, &user_id, Scrobbles::TrackId).await?;
    heard.extend(loved.iter().cloned());

    let own_artists = decayed_profile(&db, &[user_id.clone()], Scrobbles::ArtistId).await?;
    let artist_ids = top_keys(&own_artists, PROFILE_LIMIT as usize);
    if artist_ids.is_empty() {
        return Ok(RecommendationsOutput::default());
    }

    let genres = genre_profile(&db, &user_id, &loved).await?;

    let neighbours = neighbours(&db, &user_id, &artist_ids).await?;
    if neighbours.is_empty() {
        return Ok(RecommendationsOutput::default());
    }

    // similarity ∈ [0,1]: shared artists as a fraction of the listener's own.
    let similarity: HashMap<String, f64> = neighbours
        .iter()
        .map(|(id, shared)| (id.clone(), *shared as f64 / artist_ids.len() as f64))
        .collect();
    let neighbour_ids: Vec<String> = neighbours.iter().map(|(id, _)| id.clone()).collect();

    let loved_by_neighbours = loved_by(&db, &neighbour_ids, &heard).await?;
    let loved_pairs: HashSet<(String, String)> = loved_by_neighbours.iter().cloned().collect();

    let plays = decayed_pairs(&db, &neighbour_ids, Scrobbles::TrackId).await?;

    let mut scores: HashMap<String, (f64, Source)> = HashMap::new();
    for ((track_id, neighbour), play_score) in &plays {
        if heard.contains(track_id) {
            continue;
        }
        let sim = similarity.get(neighbour).copied().unwrap_or(0.0);
        let is_loved = loved_pairs.contains(&(neighbour.clone(), track_id.clone()));
        let score = sim * play_score * if is_loved { LOVED_BOOST } else { 1.0 };

        // Strictly greater, and zero never enters: a track only a
        // zero-similarity neighbour played is not a recommendation, and
        // inserting it would give it a main slot and a source label.
        if score > best(&scores, track_id) {
            let source = if is_loved {
                Source::Social
            } else {
                Source::Neighbour
            };
            scores.insert(track_id.clone(), (score, source));
        }
    }

    // Loved but never scrobbled is still a recommendation, and the strongest
    // kind of one — it just has no play history to decay.
    for (neighbour, track_id) in &loved_by_neighbours {
        if scores.contains_key(track_id) || heard.contains(track_id) {
            continue;
        }
        let sim = similarity.get(neighbour).copied().unwrap_or(0.0);
        scores.insert(track_id.clone(), (sim * LOVED_BOOST, Source::Social));
    }

    // Filtered before selection, not after, so the main slots are always
    // genre-appropriate rather than merely high-scoring.
    if !genres.is_empty() && !scores.is_empty() {
        let ids: Vec<String> = scores.keys().cloned().collect();
        let allowed = genre_ok_tracks(&db, &ids, &genres).await?;
        scores.retain(|id, _| allowed.contains(id));
    }

    let mut ranked: Vec<Candidate> = scores
        .into_iter()
        .map(|(id, (score, source))| Candidate { id, score, source })
        .collect();
    sort_by_score(&mut ranked);
    let mut candidates: Vec<Candidate> = ranked.into_iter().take(main_count).collect();

    let mut taken: HashSet<String> = candidates.iter().map(|c| c.id.clone()).collect();

    // The neighbour pool can be thin after genre filtering; top the main slots
    // up from the catalogue rather than returning a half-empty feed.
    let needed = main_count.saturating_sub(candidates.len());
    if needed > 0 && !genres.is_empty() {
        let artists = sample_artists(&db, &genres).await?;
        let uris: Vec<String> = artists.iter().filter_map(|a| a.uri.clone()).collect();
        for id in random_tracks_by_artist(&db, &uris, &heard, needed * 5).await? {
            if candidates.len() >= main_count {
                break;
            }
            if taken.insert(id.clone()) {
                candidates.push(Candidate {
                    id,
                    score: 0.0,
                    source: Source::Serendipity,
                });
            }
        }
    }

    // Serendipity: one hop out from the listener's taste — artists their
    // neighbours play that they have never heard.
    let outward = serendipity_artists(&db, &neighbour_ids, &artist_ids).await?;
    let uris = genre_ok_artist_uris(&db, &outward, &genres).await?;
    for id in random_tracks_by_artist(&db, &uris, &heard, serendipity_count * 3).await? {
        if candidates.len() >= limit as usize {
            break;
        }
        if taken.insert(id.clone()) {
            candidates.push(Candidate {
                id,
                score: 0.0,
                source: Source::Serendipity,
            });
        }
    }

    hydrate_tracks(&db, &candidates, &genres).await
}

async fn hydrate_tracks(
    db: &Backend,
    candidates: &[Candidate],
    genres: &HashSet<String>,
) -> anyhow::Result<RecommendationsOutput> {
    if candidates.is_empty() {
        return Ok(RecommendationsOutput::default());
    }

    let ids: Vec<String> = candidates.iter().map(|c| c.id.clone()).collect();
    let tracks = tracks_by_id(db, ids.iter().cloned().map(Some)).await?;
    let likes = like_counts(db, &ids).await?;
    let artists = artists_by_uri(
        db,
        &tracks
            .values()
            .filter_map(|t| t.artist_uri.clone())
            .collect::<Vec<_>>(),
    )
    .await?;
    let albums = existing_album_uris(
        db,
        &tracks
            .values()
            .filter_map(|t| t.album_uri.clone())
            .collect::<Vec<_>>(),
    )
    .await?;

    let mut items = Vec::with_capacity(candidates.len());
    for candidate in candidates {
        let Some(track) = tracks.get(&candidate.id) else {
            continue;
        };
        if track.artist.to_lowercase() == VARIOUS_ARTISTS {
            continue;
        }

        let artist = track.artist_uri.as_deref().and_then(|uri| artists.get(uri));
        let track_genres = artist.map(Artist::genres).unwrap_or_default();

        // Strict: a track whose artist carries no genres cannot be shown to
        // match the profile, so it is dropped rather than assumed to fit.
        if !genres.is_empty() && !track_genres.iter().any(|g| genres.contains(g)) {
            continue;
        }

        items.push((
            candidate.clone(),
            RecommendationView {
                title: Some(track.title.clone()),
                artist: Some(track.artist.clone()),
                album: Some(track.album.clone()),
                album_art: track.album_art.clone(),
                track_uri: track.uri.clone(),
                artist_uri: track.artist_uri.clone(),
                album_uri: track.album_uri.clone().filter(|uri| albums.contains(uri)),
                genres: track_genres,
                recommendation_score: candidate.score,
                source: candidate.source.as_str().to_string(),
                likes_count: likes.get(&candidate.id).copied().unwrap_or(0),
            },
        ));
    }

    Ok(RecommendationsOutput {
        recommendations: one_per_artist(items),
    })
}

/// Best track per artist first, then the runners-up.
///
/// Not a filter: the second-best track by an already-represented artist is
/// still a fine recommendation, it just belongs behind every artist's best
/// one. Tracks with no `artistUri` are each their own group.
fn one_per_artist(items: Vec<(Candidate, RecommendationView)>) -> Vec<RecommendationView> {
    let mut items = items;
    items.sort_by(|a, b| {
        b.1.recommendation_score
            .total_cmp(&a.1.recommendation_score)
            .then_with(|| a.0.id.cmp(&b.0.id))
    });

    let mut seen = HashSet::new();
    let mut first = Vec::new();
    let mut overflow = Vec::new();
    for (candidate, view) in items {
        let key = view
            .artist_uri
            .clone()
            .unwrap_or_else(|| candidate.id.clone());
        if seen.insert(key) {
            first.push(view);
        } else {
            overflow.push(view);
        }
    }

    first.extend(overflow);
    first
}

// ------------------------------------------------------- artist pipeline

async fn artist_fallback(
    state: &AppState,
    did: &str,
    limit: i64,
) -> anyhow::Result<RecommendedArtistsOutput> {
    let db = state.db().reads_may_lag();

    let Some(user_id) = find_user_id(&db, did).await? else {
        return Ok(RecommendedArtistsOutput::default());
    };

    let serendipity_count = (limit as f64 * SERENDIPITY_RATIO).ceil() as usize;
    let main_count = limit as usize - serendipity_count;

    let familiarity = artist_familiarity(&db, &user_id).await?;
    if familiarity.is_empty() {
        return Ok(RecommendedArtistsOutput::default());
    }
    let heard: HashSet<String> = familiarity.keys().cloned().collect();
    let heard_ids: Vec<String> = familiarity.keys().cloned().collect();

    let loved = loved_track_ids(&db, &user_id).await?;
    let genres = genre_profile(&db, &user_id, &loved).await?;

    let neighbours = neighbours(&db, &user_id, &heard_ids).await?;
    if neighbours.is_empty() {
        return Ok(RecommendedArtistsOutput::default());
    }

    let similarity: HashMap<String, f64> = neighbours
        .iter()
        .map(|(id, shared)| (id.clone(), *shared as f64 / heard_ids.len() as f64))
        .collect();
    let neighbour_ids: Vec<String> = neighbours.iter().map(|(id, _)| id.clone()).collect();

    let plays = decayed_pairs(&db, &neighbour_ids, Scrobbles::ArtistId).await?;

    let mut scores: HashMap<String, f64> = HashMap::new();
    for ((artist_id, neighbour), play_score) in &plays {
        if heard.contains(artist_id) {
            continue;
        }
        let score = similarity.get(neighbour).copied().unwrap_or(0.0) * play_score;
        if score > scores.get(artist_id).copied().unwrap_or(0.0) {
            scores.insert(artist_id.clone(), score);
        }
    }

    if !genres.is_empty() && !scores.is_empty() {
        let ids: Vec<String> = scores.keys().cloned().collect();
        let allowed: HashSet<String> = genre_ok_artists(&db, &ids, &genres)
            .await?
            .into_iter()
            .map(|artist| artist.id)
            .collect();
        scores.retain(|id, _| allowed.contains(id));
    }

    let mut ranked: Vec<Candidate> = scores
        .into_iter()
        .map(|(id, score)| Candidate {
            id,
            score,
            source: Source::Neighbour,
        })
        .collect();
    sort_by_score(&mut ranked);

    let mut candidates: Vec<Candidate> = ranked.iter().take(main_count).cloned().collect();
    let mut taken: HashSet<String> = candidates.iter().map(|c| c.id.clone()).collect();

    let needed = main_count.saturating_sub(candidates.len());
    if needed > 0 && !genres.is_empty() {
        for artist in sample_artists(&db, &genres).await? {
            if candidates.len() >= main_count {
                break;
            }
            if !heard.contains(&artist.id) && taken.insert(artist.id.clone()) {
                candidates.push(Candidate {
                    id: artist.id,
                    score: 0.0,
                    source: Source::Serendipity,
                });
            }
        }
    }

    // The tail of the scored pool: still genre-matched and still ranked, just
    // below the main cut — which is what makes it discovery rather than noise.
    for candidate in ranked.iter().skip(main_count) {
        if candidates.len() >= limit as usize {
            break;
        }
        if taken.insert(candidate.id.clone()) {
            candidates.push(Candidate {
                source: Source::Serendipity,
                ..candidate.clone()
            });
        }
    }

    if candidates.len() < limit as usize && !genres.is_empty() {
        for artist in sample_artists(&db, &genres).await? {
            if candidates.len() >= limit as usize {
                break;
            }
            if !heard.contains(&artist.id) && taken.insert(artist.id.clone()) {
                candidates.push(Candidate {
                    id: artist.id,
                    score: 0.0,
                    source: Source::Serendipity,
                });
            }
        }
    }

    let hydrated = artists_by_id(&db, candidates.iter().map(|c| Some(c.id.clone()))).await?;
    let mut artists = Vec::with_capacity(candidates.len());
    for candidate in &candidates {
        let Some(artist) = hydrated.get(&candidate.id) else {
            continue;
        };
        if artist.name.to_lowercase() == VARIOUS_ARTISTS {
            continue;
        }
        let artist_genres = artist.genres();
        if !genres.is_empty() && !artist_genres.iter().any(|g| genres.contains(g)) {
            continue;
        }
        artists.push(RecommendedArtistView {
            id: artist.id.clone(),
            uri: artist.uri.clone(),
            name: artist.name.clone(),
            picture: artist.picture.clone(),
            genres: artist_genres,
            recommendation_score: candidate.score,
            source: candidate.source.as_str().to_string(),
        });
    }

    Ok(RecommendedArtistsOutput { artists })
}

// -------------------------------------------------------- album pipeline

async fn album_fallback(
    state: &AppState,
    did: &str,
    limit: i64,
) -> anyhow::Result<RecommendedAlbumsOutput> {
    let db = state.db().reads_may_lag();

    let Some(user_id) = find_user_id(&db, did).await? else {
        return Ok(RecommendedAlbumsOutput::default());
    };

    // Two exclusions, because `scrobbles.album_id` is nullable: the album a
    // scrobbled track belongs to is only reachable through `tracks.album_uri`.
    let heard_album_ids: HashSet<String> = heard_ids(&db, &user_id, Scrobbles::AlbumId).await?;
    let heard_album_uris = heard_album_uris(&db, &user_id).await?;

    let familiarity = artist_familiarity(&db, &user_id).await?;
    if familiarity.is_empty() {
        return Ok(RecommendedAlbumsOutput::default());
    }
    let heard_artist_ids: Vec<String> = familiarity.keys().cloned().collect();

    let loved = loved_track_ids(&db, &user_id).await?;
    let genres = genre_profile(&db, &user_id, &loved).await?;

    // Pool A — the listener's own artists, records they have not played.
    let known = artists_by_id(&db, heard_artist_ids.iter().cloned().map(Some)).await?;
    let mut uri_to_artist: HashMap<String, String> = HashMap::new();
    for artist in known.values() {
        if artist.name.to_lowercase() == VARIOUS_ARTISTS {
            continue;
        }
        if let Some(uri) = artist.uri.clone() {
            uri_to_artist.insert(uri, artist.id.clone());
        }
    }
    let known_uris: Vec<String> = uri_to_artist.keys().cloned().collect();

    let mut pool: Vec<Candidate> = Vec::new();
    for (album_id, artist_uri) in
        unheard_albums(&db, &known_uris, &heard_album_ids, &heard_album_uris).await?
    {
        let score = artist_uri
            .as_deref()
            .and_then(|uri| uri_to_artist.get(uri))
            .and_then(|id| familiarity.get(id))
            .copied()
            .unwrap_or(1) as f64;
        pool.push(Candidate {
            id: album_id,
            score,
            source: Source::KnownArtist,
        });
    }

    // Pool B — artists the neighbours play that the listener has not heard.
    let neighbours = neighbours(&db, &user_id, &heard_artist_ids).await?;
    if !neighbours.is_empty() {
        let similarity: HashMap<String, f64> = neighbours
            .iter()
            .map(|(id, shared)| (id.clone(), *shared as f64 / heard_artist_ids.len() as f64))
            .collect();
        let neighbour_ids: Vec<String> = neighbours.iter().map(|(id, _)| id.clone()).collect();

        let plays = decayed_pairs(&db, &neighbour_ids, Scrobbles::ArtistId).await?;
        let mut artist_scores: HashMap<String, f64> = HashMap::new();
        for ((artist_id, neighbour), play_score) in &plays {
            if familiarity.contains_key(artist_id) {
                continue;
            }
            let score = similarity.get(neighbour).copied().unwrap_or(0.0) * play_score;
            if score > artist_scores.get(artist_id).copied().unwrap_or(0.0) {
                artist_scores.insert(artist_id.clone(), score);
            }
        }

        if !artist_scores.is_empty() {
            let ids: Vec<String> = artist_scores.keys().cloned().collect();
            let mut new_uris: HashMap<String, String> = HashMap::new();
            for artist in genre_ok_artists(&db, &ids, &genres).await? {
                if let Some(uri) = artist.uri {
                    new_uris.insert(uri, artist.id);
                }
            }

            let already: HashSet<String> = pool.iter().map(|c| c.id.clone()).collect();
            let uris: Vec<String> = new_uris.keys().cloned().collect();
            for (album_id, artist_uri) in
                unheard_albums(&db, &uris, &heard_album_ids, &heard_album_uris).await?
            {
                if already.contains(&album_id) {
                    continue;
                }
                let score = artist_uri
                    .as_deref()
                    .and_then(|uri| new_uris.get(uri))
                    .and_then(|id| artist_scores.get(id))
                    .copied()
                    .unwrap_or(0.0);
                pool.push(Candidate {
                    id: album_id,
                    score,
                    source: Source::NewArtist,
                });
            }
        }
    }

    sort_by_score(&mut pool);
    let mut seen = HashSet::new();
    let candidates: Vec<Candidate> = pool
        .into_iter()
        .filter(|c| seen.insert(c.id.clone()))
        .take(limit as usize)
        .collect();

    let hydrated = albums_by_id(&db, candidates.iter().map(|c| Some(c.id.clone()))).await?;
    let mut albums = Vec::with_capacity(candidates.len());
    for candidate in &candidates {
        let Some(album) = hydrated.get(&candidate.id) else {
            continue;
        };
        if album.artist.to_lowercase() == VARIOUS_ARTISTS {
            continue;
        }
        albums.push(RecommendedAlbumView {
            id: album.id.clone(),
            uri: album.uri.clone(),
            title: album.title.clone(),
            artist: album.artist.clone(),
            artist_uri: album.artist_uri.clone(),
            year: album.year,
            album_art: album.album_art.clone(),
            recommendation_score: candidate.score,
            source: candidate.source.as_str().to_string(),
        });
    }

    Ok(RecommendedAlbumsOutput { albums })
}

// ------------------------------------------------------------------ shared

/// Highest score first, ties broken by id so the same inputs give the same
/// feed — a `HashMap` iteration order otherwise reshuffles it every call.
fn sort_by_score(candidates: &mut [Candidate]) {
    candidates.sort_by(|a, b| b.score.total_cmp(&a.score).then_with(|| a.id.cmp(&b.id)));
}

/// The score already recorded for `id`, or zero — absent and zero are the
/// same thing to the `score > best(…)` guard, which is what keeps a
/// zero-scored candidate out of the pool entirely.
fn best(scores: &HashMap<String, (f64, Source)>, id: &str) -> f64 {
    scores.get(id).map(|(score, _)| *score).unwrap_or(0.0)
}

/// `exp(-λ · days)`, as the upstream SQL computes it.
fn decay(now: DateTime<Utc>, at: DateTime<Utc>) -> f64 {
    let days = (now - at).num_seconds() as f64 / 86_400.0;
    (-DECAY_LAMBDA * days).exp()
}

/// The highest-weighted keys of a decayed profile.
fn top_keys(scores: &HashMap<String, f64>, limit: usize) -> Vec<String> {
    let mut ranked: Vec<(&String, &f64)> = scores.iter().collect();
    ranked.sort_by(|a, b| b.1.total_cmp(a.1).then_with(|| a.0.cmp(b.0)));
    ranked
        .into_iter()
        .take(limit)
        .map(|(id, _)| id.clone())
        .collect()
}

async fn find_user_id(db: &Backend, did_or_handle: &str) -> Result<Option<String>, sqlx::Error> {
    let query = Query::select()
        .column(Users::XataId)
        .from(Users::Table)
        .and_where(
            Expr::col(Users::Did)
                .eq(did_or_handle)
                .or(Expr::col(Users::Handle).eq(did_or_handle)),
        )
        .limit(1)
        .take();
    db.fetch_scalar(&query).await
}

/// Every distinct value of one of a scrobble's foreign keys for this listener.
async fn heard_ids(
    db: &Backend,
    user_id: &str,
    column: Scrobbles,
) -> Result<HashSet<String>, sqlx::Error> {
    let query = Query::select()
        .column(column)
        .from(Scrobbles::Table)
        .and_where(Expr::col(Scrobbles::UserId).eq(user_id))
        .and_where(Expr::col(column).is_not_null())
        .add_group_by([Expr::col(column).into()])
        .take();

    Ok(db
        .fetch_scalars::<String>(&query)
        .await?
        .into_iter()
        .collect())
}

/// The albums behind the listener's scrobbled tracks, by URI.
async fn heard_album_uris(db: &Backend, user_id: &str) -> Result<HashSet<String>, sqlx::Error> {
    let s = Alias::new("s");
    let t = Alias::new("t");

    let query = Query::select()
        .expr(Expr::col((t.clone(), Tracks::AlbumUri)))
        .from_as(Scrobbles::Table, s.clone())
        .join_as(
            JoinType::InnerJoin,
            Tracks::Table,
            t.clone(),
            Expr::col((t.clone(), Tracks::XataId)).equals((s.clone(), Scrobbles::TrackId)),
        )
        .and_where(Expr::col((s, Scrobbles::UserId)).eq(user_id))
        .and_where(Expr::col((t.clone(), Tracks::AlbumUri)).is_not_null())
        .add_group_by([Expr::col((t, Tracks::AlbumUri)).into()])
        .take();

    Ok(db
        .fetch_scalars::<String>(&query)
        .await?
        .into_iter()
        .collect())
}

async fn loved_track_ids(db: &Backend, user_id: &str) -> Result<Vec<String>, sqlx::Error> {
    let query = Query::select()
        .column(LovedTracks::TrackId)
        .from(LovedTracks::Table)
        .and_where(Expr::col(LovedTracks::UserId).eq(user_id))
        .take();
    db.fetch_scalars(&query).await
}

/// `(neighbour, track)` pairs the neighbours have loved, minus what the
/// listener already knows.
async fn loved_by(
    db: &Backend,
    neighbour_ids: &[String],
    exclude: &HashSet<String>,
) -> Result<Vec<(String, String)>, sqlx::Error> {
    if neighbour_ids.is_empty() {
        return Ok(Vec::new());
    }

    let mut query = Query::select();
    query
        .columns([LovedTracks::UserId, LovedTracks::TrackId])
        .from(LovedTracks::Table)
        .and_where(Expr::col(LovedTracks::UserId).is_in(neighbour_ids.iter().map(String::as_str)));
    push_exclusion(&mut query, LovedTracks::TrackId, exclude);

    Ok(db
        .fetch_all::<(String, String)>(&query)
        .await?
        .into_iter()
        .filter(|(_, track_id)| !exclude.contains(track_id))
        .collect())
}

/// How many artists each other listener shares with this one, most first.
async fn neighbours(
    db: &Backend,
    user_id: &str,
    artist_ids: &[String],
) -> Result<Vec<(String, i64)>, sqlx::Error> {
    if artist_ids.is_empty() {
        return Ok(Vec::new());
    }
    db.fetch_all(&neighbours_query(db, user_id, artist_ids))
        .await
}

/// The neighbour ranking on its own, so its ordering can be asserted without a
/// database.
fn neighbours_query(db: &Backend, user_id: &str, artist_ids: &[String]) -> SelectStatement {
    let capped: Vec<&str> = artist_ids
        .iter()
        .take(EXCLUDE_CAP)
        .map(String::as_str)
        .collect();

    Query::select()
        .column(Scrobbles::UserId)
        .expr_as(
            db.cast_int(Func::count_distinct(Expr::col(Scrobbles::ArtistId))),
            Alias::new("shared"),
        )
        .from(Scrobbles::Table)
        .and_where(Expr::col(Scrobbles::ArtistId).is_in(capped))
        .and_where(Expr::col(Scrobbles::UserId).ne(user_id))
        .and_where(Expr::col(Scrobbles::UserId).is_not_null())
        .add_group_by([Expr::col(Scrobbles::UserId).into()])
        .order_by(Alias::new("shared"), Order::Desc)
        // Upstream has no tiebreak, so its fifty neighbours differ between two
        // identical calls and the feed churns for no reason.
        .order_by(Scrobbles::UserId, Order::Asc)
        .limit(NEIGHBOUR_LIMIT)
        .take()
}

/// The decayed play weight per key, summed across the given listeners.
async fn decayed_profile(
    db: &Backend,
    user_ids: &[String],
    column: Scrobbles,
) -> Result<HashMap<String, f64>, sqlx::Error> {
    let now = Utc::now();
    let mut scores: HashMap<String, f64> = HashMap::new();
    for (key, _, at) in recent_scrobbles(db, user_ids, column).await? {
        *scores.entry(key).or_insert(0.0) += decay(now, at);
    }
    Ok(scores)
}

/// The same, kept per `(key, listener)` — which is the grain the neighbour
/// scoring needs, since similarity is per neighbour.
async fn decayed_pairs(
    db: &Backend,
    user_ids: &[String],
    column: Scrobbles,
) -> Result<HashMap<(String, String), f64>, sqlx::Error> {
    let now = Utc::now();
    let mut scores: HashMap<(String, String), f64> = HashMap::new();
    for (key, user_id, at) in recent_scrobbles(db, user_ids, column).await? {
        *scores.entry((key, user_id)).or_insert(0.0) += decay(now, at);
    }
    Ok(scores)
}

type ScrobbleRow = (String, String, DateTime<Utc>);

async fn recent_scrobbles(
    db: &Backend,
    user_ids: &[String],
    column: Scrobbles,
) -> Result<Vec<ScrobbleRow>, sqlx::Error> {
    if user_ids.is_empty() {
        return Ok(Vec::new());
    }
    db.fetch_all(&recent_scrobbles_query(db, user_ids, column))
        .await
}

/// The decay window's statement on its own, so the horizon and the cap can be
/// asserted without a database.
fn recent_scrobbles_query(db: &Backend, user_ids: &[String], column: Scrobbles) -> SelectStatement {
    let since = Utc::now() - ChronoDuration::days(DECAY_HORIZON_DAYS);

    Query::select()
        .expr(Expr::col(column))
        .column(Scrobbles::UserId)
        // Cast so sqlx decodes Postgres' `timestamp without time zone`.
        .expr(db.cast_timestamp(Expr::col(Scrobbles::Timestamp)))
        .from(Scrobbles::Table)
        .and_where(Expr::col(Scrobbles::UserId).is_in(user_ids.iter().map(String::as_str)))
        .and_where(Expr::col(column).is_not_null())
        // Bound as text through the backend, never as a native `DateTime`:
        // SQLite stores these as ISO strings and a native bind would compare
        // against the wrong rows.
        .and_where(Expr::col(Scrobbles::Timestamp).gte(db.timestamp_value(format_timestamp(since))))
        // Most recent first, so the cap discards the plays that weigh least.
        .order_by(Scrobbles::Timestamp, Order::Desc)
        .limit(DECAY_ROW_CAP)
        .take()
}

/// The listener's artists and how much they play each.
async fn artist_familiarity(
    db: &Backend,
    user_id: &str,
) -> Result<HashMap<String, i64>, sqlx::Error> {
    let mut query = Query::select();
    query
        .column(UserArtists::ArtistId)
        .expr_as(
            db.cast_int(Expr::col(UserArtists::Scrobbles)),
            Alias::new("scrobbles"),
        )
        .from(UserArtists::Table)
        .and_where(Expr::col(UserArtists::UserId).eq(user_id))
        .order_by(UserArtists::Scrobbles, Order::Desc)
        .limit(PROFILE_LIMIT);

    Ok(db
        .fetch_all::<(String, Option<i64>)>(&query)
        .await?
        .into_iter()
        .map(|(id, scrobbles)| (id, scrobbles.unwrap_or(1)))
        .collect())
}

/// The genres worth filtering on.
///
/// Each artist's genres accumulate the listener's play count for that artist,
/// and every loved track adds [`LOVED_GENRE_WEIGHT`] to its artist's genres as
/// an explicit endorsement. Genres under [`GENRE_PROFILE_FLOOR`] of the total
/// are then dropped, so a handful of incidental plays cannot drag the whole
/// feed sideways.
async fn genre_profile(
    db: &Backend,
    user_id: &str,
    loved_track_ids: &[String],
) -> Result<HashSet<String>, sqlx::Error> {
    let familiarity = artist_familiarity(db, user_id).await?;
    let artists = artists_by_id(db, familiarity.keys().cloned().map(Some)).await?;

    let mut weights: HashMap<String, f64> = HashMap::new();
    for (artist_id, plays) in &familiarity {
        let Some(artist) = artists.get(artist_id) else {
            continue;
        };
        for genre in artist.genres() {
            *weights.entry(genre).or_insert(0.0) += *plays as f64;
        }
    }

    // Per loved *track*, not per distinct genre: an artist the listener loved
    // five tracks by is endorsed five times over.
    let loved_uris = loved_artist_uris(db, loved_track_ids).await?;
    let loved_artists = artists_by_uri(db, &loved_uris).await?;
    for uri in &loved_uris {
        let Some(artist) = loved_artists.get(uri) else {
            continue;
        };
        for genre in artist.genres() {
            *weights.entry(genre).or_insert(0.0) += LOVED_GENRE_WEIGHT;
        }
    }

    let total: f64 = weights.values().sum();
    if total <= 0.0 {
        return Ok(HashSet::new());
    }

    let mut ranked: Vec<(String, f64)> = weights.into_iter().collect();
    ranked.sort_by(|a, b| b.1.total_cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
    Ok(ranked
        .into_iter()
        .filter(|(_, weight)| weight / total >= GENRE_PROFILE_FLOOR)
        .take(GENRE_PROFILE_SIZE)
        .map(|(genre, _)| genre)
        .collect())
}

/// One artist URI per loved track, duplicates kept — the genre weighting
/// counts each loved track separately.
async fn loved_artist_uris(db: &Backend, track_ids: &[String]) -> Result<Vec<String>, sqlx::Error> {
    if track_ids.is_empty() {
        return Ok(Vec::new());
    }

    let query = Query::select()
        .column(Tracks::ArtistUri)
        .from(Tracks::Table)
        .and_where(
            Expr::col(Tracks::XataId).is_in(
                track_ids
                    .iter()
                    .take(PROFILE_LIMIT as usize)
                    .map(String::as_str),
            ),
        )
        .and_where(Expr::col(Tracks::ArtistUri).is_not_null())
        .take();

    db.fetch_scalars(&query).await
}

/// Artists keyed by URI rather than id, for joining to `tracks.artist_uri`.
async fn artists_by_uri(
    db: &Backend,
    uris: &[String],
) -> Result<HashMap<String, Artist>, sqlx::Error> {
    let unique = dedup(uris);
    if unique.is_empty() {
        return Ok(HashMap::new());
    }

    let mut query = Query::select();
    db.select_model(&mut query, ARTIST_COLS, None);
    query
        .from(Artists::Table)
        .and_where(Expr::col(Artists::Uri).is_in(unique));

    Ok(db
        .fetch_all::<Artist>(&query)
        .await?
        .into_iter()
        .filter_map(|artist| artist.uri.clone().map(|uri| (uri, artist)))
        .collect())
}

/// Which of `uris` have an album row.
///
/// Upstream reaches `albumUri` through a `LEFT JOIN` on `albums.uri`, so a
/// track pointing at an album that was never indexed reports no album URI at
/// all. Same result, without joining a table only to read back the key.
async fn existing_album_uris(
    db: &Backend,
    uris: &[String],
) -> Result<HashSet<String>, sqlx::Error> {
    let unique = dedup(uris);
    if unique.is_empty() {
        return Ok(HashSet::new());
    }

    let query = Query::select()
        .column(Albums::Uri)
        .from(Albums::Table)
        .and_where(Expr::col(Albums::Uri).is_in(unique))
        .take();

    Ok(db
        .fetch_scalars::<String>(&query)
        .await?
        .into_iter()
        .collect())
}

fn dedup(values: &[String]) -> Vec<&str> {
    let mut seen = HashSet::new();
    values
        .iter()
        .filter(|value| seen.insert(value.as_str()))
        .map(String::as_str)
        .collect()
}

/// The artists among `ids` that match the profile and are not a compilation
/// credit. An empty profile matches everything — there is nothing to check yet.
async fn genre_ok_artists(
    db: &Backend,
    ids: &[String],
    genres: &HashSet<String>,
) -> Result<Vec<Artist>, sqlx::Error> {
    if ids.is_empty() {
        return Ok(Vec::new());
    }

    Ok(artists_by_id(db, ids.iter().cloned().map(Some))
        .await?
        .into_values()
        .filter(|artist| artist.name.to_lowercase() != VARIOUS_ARTISTS)
        .filter(|artist| genres.is_empty() || artist.genres().iter().any(|g| genres.contains(g)))
        .collect())
}

async fn genre_ok_artist_uris(
    db: &Backend,
    ids: &[String],
    genres: &HashSet<String>,
) -> Result<Vec<String>, sqlx::Error> {
    Ok(genre_ok_artists(db, ids, genres)
        .await?
        .into_iter()
        .filter_map(|artist| artist.uri)
        .collect())
}

/// The tracks among `ids` whose artist matches the profile.
async fn genre_ok_tracks(
    db: &Backend,
    ids: &[String],
    genres: &HashSet<String>,
) -> Result<HashSet<String>, sqlx::Error> {
    let tracks = tracks_by_id(db, ids.iter().cloned().map(Some)).await?;
    let artists = artists_by_uri(
        db,
        &tracks
            .values()
            .filter_map(|track| track.artist_uri.clone())
            .collect::<Vec<_>>(),
    )
    .await?;

    Ok(tracks
        .into_values()
        .filter(|track| track.artist.to_lowercase() != VARIOUS_ARTISTS)
        .filter(|track| {
            track
                .artist_uri
                .as_deref()
                .and_then(|uri| artists.get(uri))
                .map(|artist| artist.genres().iter().any(|g| genres.contains(g)))
                .unwrap_or(false)
        })
        .map(|track| track.id)
        .collect())
}

/// Artists the neighbours play that the listener has not, most-played first.
async fn serendipity_artists(
    db: &Backend,
    neighbour_ids: &[String],
    own_artist_ids: &[String],
) -> Result<Vec<String>, sqlx::Error> {
    if neighbour_ids.is_empty() {
        return Ok(Vec::new());
    }

    let mut query = Query::select();
    query
        .column(Scrobbles::ArtistId)
        .expr_as(
            db.cast_int(Func::count(Expr::col(Scrobbles::XataId))),
            Alias::new("plays"),
        )
        .from(Scrobbles::Table)
        .and_where(Expr::col(Scrobbles::UserId).is_in(neighbour_ids.iter().map(String::as_str)))
        .and_where(Expr::col(Scrobbles::ArtistId).is_not_null());

    if !own_artist_ids.is_empty() {
        query.and_where(
            Expr::col(Scrobbles::ArtistId)
                .is_not_in(own_artist_ids.iter().take(EXCLUDE_CAP).map(String::as_str)),
        );
    }

    query
        .add_group_by([Expr::col(Scrobbles::ArtistId).into()])
        .order_by(Alias::new("plays"), Order::Desc)
        .order_by(Scrobbles::ArtistId, Order::Asc)
        .limit(SERENDIPITY_ARTIST_LIMIT);

    let own: HashSet<&str> = own_artist_ids.iter().map(String::as_str).collect();
    Ok(db
        .fetch_all::<(String, i64)>(&query)
        .await?
        .into_iter()
        .map(|(id, _)| id)
        .filter(|id| !own.contains(id.as_str()))
        .collect())
}

/// Random tracks by any of `artist_uris`, excluding what the listener knows.
async fn random_tracks_by_artist(
    db: &Backend,
    artist_uris: &[String],
    exclude: &HashSet<String>,
    want: usize,
) -> Result<Vec<String>, sqlx::Error> {
    if artist_uris.is_empty() || want == 0 {
        return Ok(Vec::new());
    }

    let mut query = Query::select();
    query
        .column(Tracks::XataId)
        .from(Tracks::Table)
        .and_where(Expr::col(Tracks::ArtistUri).is_in(artist_uris.iter().map(String::as_str)));
    push_exclusion(&mut query, Tracks::XataId, exclude);
    query
        .order_by_expr(Func::random().into(), Order::Asc)
        .limit(want as u64);

    Ok(db
        .fetch_scalars::<String>(&query)
        .await?
        .into_iter()
        .filter(|id| !exclude.contains(id))
        .collect())
}

/// A random sample of the artist table, kept to those matching the profile.
///
/// Upstream narrows this with a `genres @> ARRAY[…]` predicate, which has no
/// SQLite spelling. Sampling unfiltered and matching in Rust costs yield, so
/// the sample is deliberately much larger than what is needed.
async fn sample_artists(
    db: &Backend,
    genres: &HashSet<String>,
) -> Result<Vec<Artist>, sqlx::Error> {
    if genres.is_empty() {
        return Ok(Vec::new());
    }

    let mut query = Query::select();
    db.select_model(&mut query, ARTIST_COLS, None);
    query
        .from(Artists::Table)
        .order_by_expr(Func::random().into(), Order::Asc)
        .limit(SAMPLE_CAP);

    Ok(db
        .fetch_all::<Artist>(&query)
        .await?
        .into_iter()
        .filter(|artist| artist.name.to_lowercase() != VARIOUS_ARTISTS)
        .filter(|artist| artist.genres().iter().any(|g| genres.contains(g)))
        .collect())
}

/// Albums by any of `artist_uris` that the listener has not heard, under
/// either exclusion.
async fn unheard_albums(
    db: &Backend,
    artist_uris: &[String],
    heard_ids: &HashSet<String>,
    heard_uris: &HashSet<String>,
) -> Result<Vec<(String, Option<String>)>, sqlx::Error> {
    if artist_uris.is_empty() {
        return Ok(Vec::new());
    }

    let mut query = Query::select();
    query
        .columns([Albums::XataId, Albums::ArtistUri])
        .from(Albums::Table)
        .and_where(Expr::col(Albums::ArtistUri).is_in(artist_uris.iter().map(String::as_str)));
    push_exclusion(&mut query, Albums::XataId, heard_ids);
    push_exclusion(&mut query, Albums::Uri, heard_uris);
    query.limit(EXCLUDE_CAP as u64);

    Ok(db
        .fetch_all::<(String, Option<String>)>(&query)
        .await?
        .into_iter()
        .filter(|(id, _)| !heard_ids.contains(id))
        .collect())
}

async fn like_counts(db: &Backend, ids: &[String]) -> Result<HashMap<String, i64>, sqlx::Error> {
    if ids.is_empty() {
        return Ok(HashMap::new());
    }

    let mut query = Query::select();
    query
        .column(LovedTracks::TrackId)
        .expr_as(
            db.cast_int(Func::count(Expr::col(LovedTracks::XataId))),
            Alias::new("likes"),
        )
        .from(LovedTracks::Table)
        .and_where(Expr::col(LovedTracks::TrackId).is_in(ids.iter().map(String::as_str)))
        .add_group_by([Expr::col(LovedTracks::TrackId).into()]);

    Ok(db
        .fetch_all::<(String, i64)>(&query)
        .await?
        .into_iter()
        .collect())
}

/// Adds a capped `NOT IN` for an exclusion set. See [`EXCLUDE_CAP`].
fn push_exclusion(
    query: &mut SelectStatement,
    column: impl crate::sea_query::IntoColumnRef,
    exclude: &HashSet<String>,
) {
    if exclude.is_empty() {
        return;
    }

    // Sorted, so the capped slice is the same one on every call rather than
    // whatever the hash set iterated this time.
    let mut capped: Vec<&str> = exclude.iter().map(String::as_str).collect();
    capped.sort_unstable();
    capped.truncate(EXCLUDE_CAP);
    query.and_where(Expr::col(column).is_not_in(capped));
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sea_query::SqliteQueryBuilder;
    // Aliased: importing `actix_web::test` unqualified shadows the built-in
    // `#[test]` attribute, so a plain synchronous test here would be expanded
    // as an actix test and fail to compile for want of `async`.
    use actix_web::{test as http, App};

    macro_rules! app {
        ($state:expr) => {
            http::init_service(
                App::new()
                    .app_data($state.clone())
                    .app_data(web::Data::new($state.clone()))
                    .configure(crate::xrpc::configure),
            )
            .await
        };
    }

    // ------------------------------------------------------- response shape

    /// The lexicon names `recommendations`, `albums` and `artists`, and each
    /// must be an array even when there is nothing to put in it — the clients
    /// map over it without a guard.
    #[test]
    fn an_empty_answer_is_still_the_shape_the_lexicon_declares() {
        let tracks = serde_json::to_value(RecommendationsOutput::default()).unwrap();
        assert!(tracks["recommendations"].is_array(), "{tracks}");

        let albums = serde_json::to_value(RecommendedAlbumsOutput::default()).unwrap();
        assert!(albums["albums"].is_array(), "{albums}");

        let artists = serde_json::to_value(RecommendedArtistsOutput::default()).unwrap();
        assert!(artists["artists"].is_array(), "{artists}");
    }

    /// Every field the lexicon declares, spelled as the lexicon spells it.
    #[test]
    fn a_recommendation_serializes_with_the_lexicons_field_names() {
        let view = RecommendationView {
            title: Some("Roygbiv".into()),
            artist: Some("Boards of Canada".into()),
            album: Some("Music Has the Right to Children".into()),
            album_art: Some("https://cdn/art.jpg".into()),
            track_uri: Some("at://did:plc:x/app.rocksky.song/1".into()),
            artist_uri: Some("at://did:plc:x/app.rocksky.artist/1".into()),
            album_uri: Some("at://did:plc:x/app.rocksky.album/1".into()),
            genres: vec!["electronic".into()],
            recommendation_score: 0.42,
            source: "neighbour".into(),
            likes_count: 3,
        };

        let value = serde_json::to_value(&view).unwrap();
        for key in [
            "title",
            "artist",
            "album",
            "albumArt",
            "trackUri",
            "artistUri",
            "albumUri",
            "genres",
            "recommendationScore",
            "source",
            "likesCount",
        ] {
            assert!(value.get(key).is_some(), "missing {key} in {value}");
        }
        // A fraction, not an integer: the lexicon's `integer` would report
        // every real score as zero.
        assert_eq!(value["recommendationScore"], 0.42);
    }

    #[test]
    fn an_album_recommendation_serializes_with_the_lexicons_field_names() {
        let value = serde_json::to_value(RecommendedAlbumView {
            id: "rec_1".into(),
            uri: Some("at://did:plc:x/app.rocksky.album/1".into()),
            title: "Geogaddi".into(),
            artist: "Boards of Canada".into(),
            artist_uri: Some("at://did:plc:x/app.rocksky.artist/1".into()),
            year: Some(2002),
            album_art: Some("https://cdn/art.jpg".into()),
            recommendation_score: 12.0,
            source: "known-artist".into(),
        })
        .unwrap();

        for key in [
            "id",
            "uri",
            "title",
            "artist",
            "artistUri",
            "year",
            "albumArt",
            "recommendationScore",
            "source",
        ] {
            assert!(value.get(key).is_some(), "missing {key} in {value}");
        }
    }

    #[test]
    fn an_artist_recommendation_serializes_with_the_lexicons_field_names() {
        let value = serde_json::to_value(RecommendedArtistView {
            id: "rec_1".into(),
            uri: Some("at://did:plc:x/app.rocksky.artist/1".into()),
            name: "Autechre".into(),
            picture: Some("https://cdn/pic.jpg".into()),
            genres: vec!["idm".into()],
            recommendation_score: 0.1,
            source: "serendipity".into(),
        })
        .unwrap();

        for key in [
            "id",
            "uri",
            "name",
            "picture",
            "genres",
            "recommendationScore",
            "source",
        ] {
            assert!(value.get(key).is_some(), "missing {key} in {value}");
        }
    }

    /// Drift's body is returned verbatim, so it has to deserialize into these
    /// views exactly as drift writes it — see `drift/src/models.rs`.
    #[test]
    fn drifts_body_deserializes_into_the_view() {
        let body = serde_json::json!({
            "recommendations": [{
                "title": "Roygbiv",
                "artist": "Boards of Canada",
                "genres": ["electronic"],
                "recommendationScore": 0.0431,
                "source": "chart",
                "likesCount": 7
            }]
        });

        let output: RecommendationsOutput = serde_json::from_value(body).unwrap();
        let first = &output.recommendations[0];
        assert_eq!(first.title.as_deref(), Some("Roygbiv"));
        assert_eq!(first.genres, vec!["electronic"]);
        assert_eq!(first.recommendation_score, 0.0431);
        assert_eq!(first.likes_count, 7);
        // Absent optional fields must read as absent, not fail the parse.
        assert!(first.album_uri.is_none());
    }

    // -------------------------------------------------------- degradation

    /// No drift and nothing to recommend from must answer an empty set, not an
    /// error: these sit on a page next to other panels, and a 500 takes the
    /// page with it.
    #[actix_web::test]
    async fn an_absent_drift_url_degrades_to_empty() {
        let state = AppState::for_test().await.unwrap();
        assert!(
            state.config().drift_url.is_none(),
            "the test config must not point at a drift"
        );
        let app = app!(state);

        for nsid in [
            "app.rocksky.feed.getRecommendations",
            "app.rocksky.feed.getAlbumRecommendations",
            "app.rocksky.feed.getArtistRecommendations",
        ] {
            let res = http::call_service(
                &app,
                http::TestRequest::get()
                    .uri(&format!("/xrpc/{nsid}?did=did:plc:nobody"))
                    .to_request(),
            )
            .await;

            assert_eq!(res.status(), 200, "{nsid}");
            let body: serde_json::Value = http::read_body_json(res).await;
            let list = body
                .as_object()
                .and_then(|map| map.values().next())
                .and_then(|value| value.as_array())
                .unwrap_or_else(|| panic!("{nsid} answered {body}"));
            assert!(list.is_empty(), "{nsid} answered {body}");
        }
    }

    /// Alice plays Boards of Canada; Bob plays Boards of Canada *and* Nine
    /// Inch Nails. That makes Bob a neighbour and Nine Inch Nails — same
    /// genre, never heard — the one thing all three surfaces should surface.
    async fn seeded() -> AppState {
        let state = AppState::for_test().await.unwrap();
        let now = format_timestamp(Utc::now());

        let statements = [
            "INSERT INTO users (xata_id, did, handle, avatar) VALUES \
             ('rec_alice', 'did:plc:alice', 'alice.test', 'a'), \
             ('rec_bob',   'did:plc:bob',   'bob.test',   'b')"
                .to_string(),
            "INSERT INTO artists (xata_id, name, sha256, uri, genres) VALUES \
             ('rec_boc', 'Boards of Canada', 'sha-boc', 'at://svc/app.rocksky.artist/boc', '[\"electronic\"]'), \
             ('rec_nin', 'Nine Inch Nails',  'sha-nin', 'at://svc/app.rocksky.artist/nin', '[\"electronic\"]')"
                .to_string(),
            "INSERT INTO albums (xata_id, title, artist, sha256, uri, artist_uri, year) VALUES \
             ('rec_al1', 'MHTRTC', 'Boards of Canada', 'sha-al1', 'at://svc/app.rocksky.album/1', 'at://svc/app.rocksky.artist/boc', 1998), \
             ('rec_al2', 'Pretty Hate Machine', 'Nine Inch Nails', 'sha-al2', 'at://svc/app.rocksky.album/2', 'at://svc/app.rocksky.artist/nin', 1989)"
                .to_string(),
            "INSERT INTO tracks (xata_id, title, artist, album_artist, album, duration, sha256, uri, artist_uri, album_uri) VALUES \
             ('rec_t1', 'Roygbiv', 'Boards of Canada', 'Boards of Canada', 'MHTRTC', 1000, 'sha-t1', 'at://svc/app.rocksky.song/1', 'at://svc/app.rocksky.artist/boc', 'at://svc/app.rocksky.album/1'), \
             ('rec_t2', 'Head Like a Hole', 'Nine Inch Nails', 'Nine Inch Nails', 'Pretty Hate Machine', 2000, 'sha-t2', 'at://svc/app.rocksky.song/2', 'at://svc/app.rocksky.artist/nin', 'at://svc/app.rocksky.album/2')"
                .to_string(),
            "INSERT INTO user_artists (xata_id, user_id, artist_id, scrobbles, uri) VALUES \
             ('rec_ua1', 'rec_alice', 'rec_boc', 5, 'at://alice/ua/boc'), \
             ('rec_ua2', 'rec_bob',   'rec_boc', 1, 'at://bob/ua/boc'), \
             ('rec_ua3', 'rec_bob',   'rec_nin', 3, 'at://bob/ua/nin')"
                .to_string(),
            format!(
                "INSERT INTO scrobbles (xata_id, user_id, track_id, album_id, artist_id, uri, timestamp) VALUES \
                 ('rec_s1', 'rec_alice', 'rec_t1', 'rec_al1', 'rec_boc', 'at://alice/s/1', '{now}'), \
                 ('rec_s2', 'rec_bob',   'rec_t1', 'rec_al1', 'rec_boc', 'at://bob/s/1',   '{now}'), \
                 ('rec_s3', 'rec_bob',   'rec_t2', 'rec_al2', 'rec_nin', 'at://bob/s/2',   '{now}')"
            ),
        ];

        for text in statements {
            let statement = state.db().sql(text.clone());
            state.db().execute(&statement).await.expect(&text);
        }
        state
    }

    /// The whole pipeline has to *run* and *answer*, not just compile: every
    /// query here was rewritten from a TypeScript original, and one that
    /// builds can still name a column that holds something else.
    #[actix_web::test]
    async fn the_fallback_recommends_a_neighbours_artist() {
        let state = seeded().await;
        let app = app!(state);

        let get = |nsid: &str| {
            http::TestRequest::get()
                .uri(&format!("/xrpc/{nsid}?did=did:plc:alice&limit=10"))
                .to_request()
        };

        let res = http::call_service(&app, get("app.rocksky.feed.getRecommendations")).await;
        assert_eq!(res.status(), 200);
        let body: serde_json::Value = http::read_body_json(res).await;
        // The track Alice has already played must not come back as a
        // recommendation, and the one she has not must.
        assert_eq!(
            body["recommendations"][0]["title"], "Head Like a Hole",
            "{body}"
        );
        assert_eq!(body["recommendations"][0]["source"], "neighbour", "{body}");
        assert_eq!(
            body["recommendations"][0]["genres"][0], "electronic",
            "{body}"
        );
        assert!(
            body["recommendations"]
                .as_array()
                .unwrap()
                .iter()
                .all(|view| view["title"] != "Roygbiv"),
            "{body}"
        );

        let res = http::call_service(&app, get("app.rocksky.feed.getArtistRecommendations")).await;
        assert_eq!(res.status(), 200);
        let body: serde_json::Value = http::read_body_json(res).await;
        assert_eq!(body["artists"][0]["name"], "Nine Inch Nails", "{body}");
        assert_eq!(body["artists"][0]["source"], "neighbour", "{body}");

        let res = http::call_service(&app, get("app.rocksky.feed.getAlbumRecommendations")).await;
        assert_eq!(res.status(), 200);
        let body: serde_json::Value = http::read_body_json(res).await;
        assert_eq!(body["albums"][0]["title"], "Pretty Hate Machine", "{body}");
        // Pool B: a record by an artist the neighbours play and Alice has not.
        assert_eq!(body["albums"][0]["source"], "new-artist", "{body}");
        assert_eq!(body["albums"][0]["year"], 1989, "{body}");
    }

    /// An unknown actor is an empty feed, not a 404 — the panel renders as
    /// "nothing yet" and the page around it is unaffected.
    #[actix_web::test]
    async fn an_unknown_actor_gets_an_empty_feed() {
        let state = seeded().await;
        let app = app!(state);

        let res = http::call_service(
            &app,
            http::TestRequest::get()
                .uri("/xrpc/app.rocksky.feed.getRecommendations?did=did:plc:nobody")
                .to_request(),
        )
        .await;
        assert_eq!(res.status(), 200);
        let body: serde_json::Value = http::read_body_json(res).await;
        assert!(
            body["recommendations"].as_array().unwrap().is_empty(),
            "{body}"
        );
    }

    // ------------------------------------------------------------ ranking

    /// Highest score first, and a tie broken by id — without the tiebreak the
    /// order comes from `HashMap` iteration and the feed reshuffles itself on
    /// every request.
    #[test]
    fn candidates_rank_by_score_then_by_id() {
        let mut candidates = vec![
            Candidate {
                id: "b".into(),
                score: 1.0,
                source: Source::Neighbour,
            },
            Candidate {
                id: "a".into(),
                score: 1.0,
                source: Source::Neighbour,
            },
            Candidate {
                id: "c".into(),
                score: 9.0,
                source: Source::Social,
            },
        ];
        sort_by_score(&mut candidates);

        let order: Vec<&str> = candidates.iter().map(|c| c.id.as_str()).collect();
        assert_eq!(order, ["c", "a", "b"]);
    }

    /// The decay is what makes a recent play worth more than an old one, and
    /// it must be `exp(-λ·days)` rather than anything merely monotonic — the
    /// scores are multiplied by a similarity and compared across neighbours.
    #[test]
    fn the_decay_halves_roughly_every_five_weeks() {
        let now = Utc::now();

        assert_eq!(decay(now, now), 1.0);

        let five_weeks = decay(now, now - ChronoDuration::days(35));
        assert!((five_weeks - 0.5).abs() < 0.01, "got {five_weeks}");

        // And a year-old play is negligible, which is what makes the horizon
        // in `recent_scrobbles_query` free.
        let a_year = decay(now, now - ChronoDuration::days(365));
        assert!(a_year < 0.001, "got {a_year}");
    }

    #[test]
    fn a_profile_keeps_the_heaviest_keys_in_order() {
        let scores = HashMap::from([
            ("a".to_string(), 1.0),
            ("b".to_string(), 3.0),
            ("c".to_string(), 2.0),
        ]);
        assert_eq!(top_keys(&scores, 2), vec!["b", "c"]);
    }

    /// The runner-up by an already-represented artist belongs behind every
    /// artist's best track, but must not be dropped — the list would come back
    /// shorter than asked for.
    #[test]
    fn one_track_per_artist_comes_first_and_the_rest_follow() {
        let candidate = |id: &str| Candidate {
            id: id.to_string(),
            score: 0.0,
            source: Source::Neighbour,
        };
        let view = |id: &str, artist: &str, score: f64| RecommendationView {
            title: Some(id.to_string()),
            artist_uri: Some(artist.to_string()),
            recommendation_score: score,
            ..Default::default()
        };

        let ordered = one_per_artist(vec![
            (candidate("1"), view("1", "artist-a", 9.0)),
            (candidate("2"), view("2", "artist-a", 8.0)),
            (candidate("3"), view("3", "artist-b", 7.0)),
        ]);

        let titles: Vec<&str> = ordered
            .iter()
            .map(|view| view.title.as_deref().unwrap())
            .collect();
        assert_eq!(titles, ["1", "3", "2"]);
    }

    /// A track with no artist URI is its own group, so several of them must
    /// all survive rather than collapsing into one.
    #[test]
    fn tracks_without_an_artist_uri_are_each_their_own_group() {
        let candidate = |id: &str| Candidate {
            id: id.to_string(),
            score: 0.0,
            source: Source::Neighbour,
        };
        let ordered = one_per_artist(vec![
            (
                candidate("1"),
                RecommendationView {
                    title: Some("1".into()),
                    ..Default::default()
                },
            ),
            (
                candidate("2"),
                RecommendationView {
                    title: Some("2".into()),
                    ..Default::default()
                },
            ),
        ]);
        assert_eq!(ordered.len(), 2);
    }

    #[test]
    fn the_sources_are_spelled_as_the_lexicon_describes_them() {
        assert_eq!(Source::Neighbour.as_str(), "neighbour");
        assert_eq!(Source::Social.as_str(), "social");
        assert_eq!(Source::Serendipity.as_str(), "serendipity");
        assert_eq!(Source::KnownArtist.as_str(), "known-artist");
        assert_eq!(Source::NewArtist.as_str(), "new-artist");
    }

    // --------------------------------------------------------- statements

    #[tokio::test]
    async fn the_neighbour_ranking_breaks_ties_by_user() {
        let db = crate::db::connect_in_memory().await.unwrap();
        let sql = neighbours_query(&db, "me", &["a".to_string(), "b".to_string()])
            .to_string(SqliteQueryBuilder);

        assert!(
            sql.contains(r#"ORDER BY "shared" DESC, "user_id" ASC"#),
            "{sql}"
        );
        assert!(sql.contains(r#""user_id" <> 'me'"#), "{sql}");
        assert!(sql.contains("COUNT(DISTINCT"), "{sql}");
        assert!(sql.contains("LIMIT 50"), "{sql}");
    }

    /// The horizon is bound as text and compared against the column directly.
    /// A native `DateTime` bind would be a number on SQLite and match the
    /// wrong rows; a cast there would truncate the ISO string to its year.
    #[tokio::test]
    async fn the_decay_window_binds_its_horizon_as_text() {
        let db = crate::db::connect_in_memory().await.unwrap();
        let query = recent_scrobbles_query(&db, &["me".to_string()], Scrobbles::ArtistId);

        let rendered = query.to_string(SqliteQueryBuilder);
        assert!(
            rendered.contains(r#"ORDER BY "timestamp" DESC"#),
            "{rendered}"
        );
        assert!(rendered.contains("LIMIT 50000"), "{rendered}");

        let (sql, values) = query.build(SqliteQueryBuilder);
        assert!(sql.contains(r#""timestamp" >= ?"#), "{sql}");

        let horizon = values
            .0
            .iter()
            .filter_map(|value| match value {
                crate::sea_query::Value::String(Some(text)) => Some(text.to_string()),
                _ => None,
            })
            .find(|text| text.ends_with('Z'))
            .unwrap_or_else(|| panic!("no ISO horizon bound in {:?}", values.0));
        // Roughly a year back, formatted the way the column stores it.
        let parsed = horizon.parse::<DateTime<Utc>>().unwrap();
        let days = Utc::now().signed_duration_since(parsed).num_days();
        assert!((364..=366).contains(&days), "got {days} days: {horizon}");
    }

    /// An exclusion set is bound one placeholder per id, capped, and in a
    /// stable order — an uncapped list would exceed Postgres' parameter limit
    /// for a heavy listener.
    #[test]
    fn an_exclusion_is_capped_and_deterministic() {
        let exclude: HashSet<String> = (0..EXCLUDE_CAP * 2)
            .map(|index| format!("rec_{index:05}"))
            .collect();

        let render = || {
            let mut query = Query::select();
            query
                .column(Tracks::XataId)
                .from(Tracks::Table)
                .and_where(Expr::col(Tracks::ArtistUri).eq("at://x"));
            push_exclusion(&mut query, Tracks::XataId, &exclude);
            query.build(SqliteQueryBuilder)
        };

        let (_, values) = render();
        // One artist URI plus the capped exclusion.
        assert_eq!(values.0.len(), EXCLUDE_CAP + 1);

        let (_, again) = render();
        assert_eq!(format!("{:?}", values.0), format!("{:?}", again.0));

        // And an empty set must not narrow the query at all.
        let mut query = Query::select();
        query.column(Tracks::XataId).from(Tracks::Table);
        push_exclusion(&mut query, Tracks::XataId, &HashSet::new());
        assert!(
            !query.to_string(SqliteQueryBuilder).contains("NOT IN"),
            "an empty exclusion must add no clause"
        );
    }

    /// `RANDOM()` is the one sampling spelling both backends share, so it must
    /// render without a dialect branch.
    #[tokio::test]
    async fn the_random_sample_uses_a_portable_ordering() {
        let db = crate::db::connect_in_memory().await.unwrap();
        let mut query = Query::select();
        db.select_model(&mut query, ARTIST_COLS, None);
        query
            .from(Artists::Table)
            .order_by_expr(Func::random().into(), Order::Asc)
            .limit(SAMPLE_CAP);

        let sql = query.to_string(SqliteQueryBuilder);
        assert!(sql.contains("RANDOM()"), "{sql}");
        assert!(sql.contains("LIMIT 2000"), "{sql}");
    }

    #[test]
    fn a_cache_key_names_the_surface_the_did_and_the_limit() {
        assert_eq!(
            cache_key("tracks", "did:plc:alice", 50),
            "recommendations:tracks:v1:did:plc:alice:50"
        );
    }
}
