//! The HTTP surface of the ListenBrainz API. See [`crate::listenbrainz`] for
//! what each route draws in a client and why the reads are unauthenticated.

use std::sync::Arc;

use actix_web::{get, post, web, HttpRequest, HttpResponse, Responder};
use chrono::Utc;
use rocksky_db::models::User;
use rocksky_db::Backend;
use serde::Deserialize;
use tokio_stream::StreamExt;

use crate::{
    auth::validate_bearer_token,
    cache::Cache,
    events::Events,
    listenbrainz::{
        core::{
            delete_listen::delete_listen,
            following::{get_followers, get_following},
            listen_count::get_listen_count,
            listens::{get_listens, ListensParams},
            playing_now,
            search_users::search_users,
            submit::{submit_listens, submitted_msid},
        },
        feedback::{
            self,
            get_feedback::{get_feedback, FeedbackParams},
            recording_feedback,
        },
        metadata,
        range::{self, Window},
        statistics::{
            self, activity::get_listening_activity, artists::get_top_artists,
            recordings::get_top_recordings, release_groups::get_top_release_groups,
            releases::get_top_releases, StatsParams,
        },
        types::ApiError,
        users,
    },
    musicbrainz::client::MusicbrainzClient,
    repo,
};

#[macro_export]
macro_rules! read_payload {
    ($payload:expr) => {{
        let mut body = Vec::new();
        while let Some(chunk) = $payload.next().await {
            match chunk {
                Ok(bytes) => body.extend_from_slice(&bytes),
                Err(err) => return Err(err.into()),
            }
        }
        body
    }};
}

// ------------------------------------------------------------------ helpers

/// How long a chart is served from Redis before it is recomputed.
///
/// These are aggregates over a user's whole history and a client refetches
/// them on every tab change, so without this the charts screen is several
/// full scans per swipe. Two minutes is far fresher than ListenBrainz's own
/// stats, which are recomputed daily.
const STATS_TTL: usize = 120;

/// The user a `{user_name}` path segment names, or the 404 ListenBrainz
/// answers for one it does not know.
async fn resolve(db: &Backend, name: &str) -> Result<User, Box<HttpResponse>> {
    match users::find(db, name).await {
        Ok(Some(user)) => Ok(user),
        Ok(None) => Err(Box::new(
            HttpResponse::NotFound()
                .json(ApiError::new(404, format!("Cannot find user: {}", name))),
        )),
        Err(err) => {
            tracing::error!(error = %err, user = %name, "error resolving a ListenBrainz user");
            Err(Box::new(internal()))
        }
    }
}

fn internal() -> HttpResponse {
    HttpResponse::InternalServerError().json(ApiError::new(
        500,
        "Something went wrong. Please try again later.",
    ))
}

/// Turns an `Err` from a read into a 500 without losing the reason.
fn answer<T: serde::Serialize>(result: anyhow::Result<T>, what: &str) -> HttpResponse {
    match result {
        Ok(body) => HttpResponse::Ok().json(body),
        Err(err) => {
            tracing::error!(error = %err, "error answering {}", what);
            internal()
        }
    }
}

/// The window a `range` parameter names, or the 400 an unknown one earns.
fn window_for(range: &str) -> Result<Window, Box<HttpResponse>> {
    range::window(range, Utc::now()).ok_or_else(|| {
        Box::new(HttpResponse::BadRequest().json(ApiError::new(
            400,
            format!("Invalid range: {}. Must be one of this_week, week, this_month, month, quarter, half_yearly, this_year, year, all_time.", range),
        )))
    })
}

/// Serves a chart from Redis when it is there, and caches what it computes.
///
/// A cache that is down is not an error: the work is simply done again.
async fn cached<F, T>(cache: &Cache, key: String, compute: F) -> anyhow::Result<serde_json::Value>
where
    F: std::future::Future<Output = anyhow::Result<T>>,
    T: serde::Serialize,
{
    if let Ok(Some(hit)) = cache.get(&key) {
        if let Ok(value) = serde_json::from_str(&hit) {
            return Ok(value);
        }
    }

    let value = serde_json::to_value(compute.await?)?;
    if let Ok(text) = serde_json::to_string(&value) {
        if let Err(err) = cache.setex(&key, &text, STATS_TTL) {
            tracing::debug!(error = %err, "could not cache a ListenBrainz chart");
        }
    }
    Ok(value)
}

// ------------------------------------------------------------- query params

#[derive(Debug, Clone, Default, Deserialize)]
struct ListensQuery {
    count: Option<i64>,
    max_ts: Option<i64>,
    min_ts: Option<i64>,
}

#[derive(Debug, Clone, Default, Deserialize)]
struct StatsQuery {
    range: Option<String>,
    count: Option<i64>,
    offset: Option<i64>,
}

impl StatsQuery {
    fn range(&self) -> &str {
        self.range.as_deref().unwrap_or(range::DEFAULT)
    }

    fn params(&self) -> StatsParams {
        StatsParams {
            range: self.range.clone(),
            count: self.count,
            offset: self.offset,
        }
    }

    fn cache_key(&self, chart: &str, user: &User) -> String {
        format!(
            "listenbrainz:stats:{}:{}:{}:{}:{}",
            chart,
            user.id,
            self.range(),
            self.count.unwrap_or(statistics::DEFAULT_COUNT),
            self.offset.unwrap_or(0)
        )
    }
}

#[derive(Debug, Clone, Default, Deserialize)]
struct FeedbackQuery {
    count: Option<i64>,
    offset: Option<i64>,
    score: Option<i32>,
}

#[derive(Debug, Clone, Default, Deserialize)]
struct SearchQuery {
    /// ListenBrainz's own name for it; `query` is accepted as well because
    /// several clients send that instead.
    search_term: Option<String>,
    query: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize)]
struct LookupQuery {
    artist_name: Option<String>,
    recording_name: Option<String>,
    release_name: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize)]
struct SubmitQuery {
    /// Sent as `true` or `1` depending on the client.
    return_msid: Option<String>,
}

impl SubmitQuery {
    fn wants_msid(&self) -> bool {
        matches!(
            self.return_msid.as_deref(),
            Some("true") | Some("True") | Some("1")
        )
    }
}

// -------------------------------------------------------------- submissions

#[post("/1/submit-listens")]
pub async fn handle_submit_listens(
    req: HttpRequest,
    data: web::Data<Arc<Backend>>,
    cache: web::Data<Cache>,
    mb_client: web::Data<Arc<MusicbrainzClient>>,
    events: web::Data<Arc<Events>>,
    query: web::Query<SubmitQuery>,
    mut payload: web::Payload,
) -> Result<HttpResponse, actix_web::Error> {
    let Some(token) = users::bearer(&req) else {
        return Ok(HttpResponse::Unauthorized().finish());
    };
    let token = token.to_string();

    let is_kodi = req
        .headers()
        .get("User-Agent")
        .and_then(|v| v.to_str().ok())
        .map(|ua| ua.to_lowercase().contains("kodi"))
        .unwrap_or(false);

    let pool = data.get_ref();
    validate_bearer_token(pool, &token).await.map_err(|e| {
        let msg = e.to_string();
        if msg.contains("pool timed out") {
            actix_web::error::ErrorServiceUnavailable(msg)
        } else {
            actix_web::error::ErrorUnauthorized(format!("Invalid token: {}", msg))
        }
    })?;

    let payload = read_payload!(payload);
    let body = String::from_utf8_lossy(&payload);
    let mut listens =
        serde_json::from_str::<crate::listenbrainz::types::SubmitListensRequest>(&body)
            .map_err(|e| {
                tracing::error!(body = %body, error = %e, "Error parsing request body");
                e
            })
            .map_err(actix_web::error::ErrorBadRequest)?;

    if listens.listen_type == "playing_now" {
        if let Some(listen) = listens.payload.first() {
            // The whole row, not just the DID: the now-playing cache is keyed
            // by DID and reported under the handle, and both are one indexed
            // lookup away once the token has been resolved.
            let submitter = match users::did_for_token(pool, &token).await {
                Ok(Some(did)) => users::find_by_did(pool, &did).await.unwrap_or_default(),
                Ok(None) => None,
                Err(err) => {
                    tracing::warn!(error = %err, "could not identify the now-playing submitter");
                    None
                }
            };

            if let Some(submitter) = submitter {
                let did = submitter.did.clone();
                let meta = &listen.track_metadata;
                let duration_ms = meta
                    .additional_info
                    .as_ref()
                    .and_then(|info| info.duration_ms())
                    .unwrap_or(0) as u64;

                let recording_mb_id = meta
                    .additional_info
                    .as_ref()
                    .and_then(|i| i.musicbrainz_track_id.as_deref());

                let track = serde_json::json!({
                    "name": meta.track_name,
                    "artist": meta.artist_name,
                    "album": meta.release_name,
                    "duration_ms": duration_ms,
                    "recording_mb_id": recording_mb_id,
                });

                // The one place a now-playing is recorded for this user: it is
                // what `GET /1/user/{name}/playing-now` reads back, and the
                // only source for somebody scrobbling from a ListenBrainz
                // client rather than a Rocksky player.
                playing_now::remember(cache.get_ref(), &did, &submitter.handle, &listens);

                events.emit_song_changed(&did, track).await;
                // Only schedule stop timer when duration is known; if unknown we
                // rely on the next playing_now submission (or never fire).
                if duration_ms > 0 {
                    events.schedule_song_stopped(did, duration_ms).await;
                }
            }
        }
    }

    if is_kodi && listens.listen_type == "playing_now" {
        listens.listen_type = "single".to_string();
    }

    let msid = query
        .wants_msid()
        .then(|| submitted_msid(&listens))
        .flatten();

    let mb_client = mb_client.get_ref();
    let mut response = submit_listens(listens, cache.get_ref(), data.get_ref(), mb_client, &token)
        .await
        .map_err(actix_web::error::ErrorInternalServerError)?;
    response.recording_msid = msid;

    Ok(HttpResponse::Ok().json(response))
}

#[post("/1/delete-listen")]
pub async fn handle_delete_listen() -> impl Responder {
    delete_listen()
}

#[get("/1/validate-token")]
pub async fn handle_validate_token(
    data: web::Data<Arc<Backend>>,
    req: HttpRequest,
) -> impl Responder {
    let pool = data.get_ref();
    let authorization = req.headers().get("Authorization");

    if authorization.is_none() {
        return HttpResponse::Ok().json(serde_json::json!({
            "code": 200,
            "message": "Token valid.",
            "valid": true,
        }));
    }

    let Some(token) = users::bearer(&req) else {
        return HttpResponse::Unauthorized().finish();
    };

    match repo::user::get_user_by_apikey(pool, token).await {
        Ok(Some(user)) => HttpResponse::Ok().json(serde_json::json!({
            "code": 200,
            "message": "Token valid.",
            "valid": true,
            "user_name": user.handle,
            "permissions": vec![
                "recording-metadata-write",
                "recording-metadata-read"
            ],
        })),
        Ok(None) => HttpResponse::Ok().json(serde_json::json!({
            "code": 200,
            "message": "Token invalid.",
            "valid": false,
        })),
        Err(e) => {
            tracing::error!(error = %e, "Error validating token");
            internal()
        }
    }
}

// -------------------------------------------------------------------- reads

#[get("/1/user/{user_name}/listens")]
pub async fn handle_get_listens(
    data: web::Data<Arc<Backend>>,
    user_name: web::Path<String>,
    query: web::Query<ListensQuery>,
) -> impl Responder {
    let db = data.get_ref();
    let user = match resolve(db, &user_name).await {
        Ok(user) => user,
        Err(response) => return *response,
    };

    let params = ListensParams {
        count: query.count,
        max_ts: query.max_ts,
        min_ts: query.min_ts,
    };
    answer(get_listens(db, &user, params).await, "listens")
}

#[get("/1/user/{user_name}/playing-now")]
pub async fn handle_get_playing_now(
    data: web::Data<Arc<Backend>>,
    cache: web::Data<Cache>,
    user_name: web::Path<String>,
) -> impl Responder {
    let user = match resolve(data.get_ref(), &user_name).await {
        Ok(user) => user,
        Err(response) => return *response,
    };
    answer(
        playing_now::get_playing_now(cache.get_ref(), &user),
        "the now-playing listen",
    )
}

#[get("/1/user/{user_name}/listen-count")]
pub async fn handle_get_listen_count(
    data: web::Data<Arc<Backend>>,
    user_name: web::Path<String>,
) -> impl Responder {
    let db = data.get_ref();
    let user = match resolve(db, &user_name).await {
        Ok(user) => user,
        Err(response) => return *response,
    };
    answer(get_listen_count(db, &user).await, "a listen count")
}

#[get("/1/user/{user_name}/following")]
pub async fn handle_get_following(
    data: web::Data<Arc<Backend>>,
    user_name: web::Path<String>,
) -> impl Responder {
    let db = data.get_ref();
    let user = match resolve(db, &user_name).await {
        Ok(user) => user,
        Err(response) => return *response,
    };
    answer(get_following(db, &user).await, "a following list")
}

#[get("/1/user/{user_name}/followers")]
pub async fn handle_get_followers(
    data: web::Data<Arc<Backend>>,
    user_name: web::Path<String>,
) -> impl Responder {
    let db = data.get_ref();
    let user = match resolve(db, &user_name).await {
        Ok(user) => user,
        Err(response) => return *response,
    };
    answer(get_followers(db, &user).await, "a followers list")
}

#[get("/1/search/users")]
pub async fn handle_search_users(
    data: web::Data<Arc<Backend>>,
    query: web::Query<SearchQuery>,
) -> impl Responder {
    let term = query
        .search_term
        .as_deref()
        .or(query.query.as_deref())
        .unwrap_or_default();
    answer(search_users(data.get_ref(), term).await, "a user search")
}

#[get("/1/metadata/lookup")]
pub async fn handle_metadata_lookup(
    data: web::Data<Arc<Backend>>,
    query: web::Query<LookupQuery>,
) -> impl Responder {
    let (Some(artist), Some(recording)) = (
        query.artist_name.as_deref(),
        query.recording_name.as_deref(),
    ) else {
        return HttpResponse::BadRequest().json(ApiError::new(
            400,
            "artist_name and recording_name are required.",
        ));
    };

    answer(
        metadata::lookup(
            data.get_ref(),
            artist,
            recording,
            query.release_name.as_deref(),
        )
        .await,
        "a metadata lookup",
    )
}

// ----------------------------------------------------------------- feedback

#[get("/1/feedback/user/{user_name}/get-feedback")]
pub async fn handle_get_feedback(
    data: web::Data<Arc<Backend>>,
    user_name: web::Path<String>,
    query: web::Query<FeedbackQuery>,
) -> impl Responder {
    let db = data.get_ref();
    let user = match resolve(db, &user_name).await {
        Ok(user) => user,
        Err(response) => return *response,
    };

    let params = FeedbackParams {
        count: query.count,
        offset: query.offset,
        score: query.score,
    };
    answer(get_feedback(db, &user, &params).await, "loved tracks")
}

#[post("/1/feedback/recording-feedback")]
pub async fn handle_recording_feedback(
    req: HttpRequest,
    data: web::Data<Arc<Backend>>,
    body: web::Json<crate::listenbrainz::types::FeedbackRequest>,
) -> impl Responder {
    let db = data.get_ref();

    let Some(token) = users::bearer(&req) else {
        return HttpResponse::Unauthorized().json(ApiError::new(
            401,
            "You need to provide an Authorization header.",
        ));
    };

    let did = match users::did_for_token(db, token).await {
        Ok(Some(did)) => did,
        Ok(None) => {
            return HttpResponse::Unauthorized()
                .json(ApiError::new(401, "Invalid authorization token."))
        }
        Err(err) => {
            tracing::error!(error = %err, "error authenticating a feedback request");
            return internal();
        }
    };

    let track = match feedback::resolve(
        db,
        body.recording_mbid.as_deref(),
        body.recording_msid.as_deref(),
    )
    .await
    {
        Ok(Some(track)) => track,
        // ListenBrainz answers 400 for a recording it cannot place, and the
        // client shows the heart as unchanged rather than silently lying.
        Ok(None) => {
            return HttpResponse::BadRequest().json(ApiError::new(
                400,
                "That recording is not in this catalogue, so it cannot be rated.",
            ))
        }
        Err(err) => {
            tracing::error!(error = %err, "error resolving a recording for feedback");
            return internal();
        }
    };

    match recording_feedback::apply(&did, &track, body.score).await {
        Ok(()) => HttpResponse::Ok().json(serde_json::json!({ "status": "ok" })),
        Err(err) => {
            tracing::error!(error = %err, did = %did, "error recording feedback");
            internal()
        }
    }
}

// -------------------------------------------------------------------- stats

/// The four top-N charts, which differ only in which loader they call.
macro_rules! chart {
    ($handler:ident, $route:literal, $chart:literal, $load:path) => {
        #[get($route)]
        pub async fn $handler(
            data: web::Data<Arc<Backend>>,
            cache: web::Data<Cache>,
            user_name: web::Path<String>,
            query: web::Query<StatsQuery>,
        ) -> impl Responder {
            let db = data.get_ref();
            let user = match resolve(db, &user_name).await {
                Ok(user) => user,
                Err(response) => return *response,
            };
            let window = match window_for(query.range()) {
                Ok(window) => window,
                Err(response) => return *response,
            };

            let key = query.cache_key($chart, &user);
            let params = query.params();
            let range = query.range().to_string();
            answer(
                cached(cache.get_ref(), key, async {
                    $load(db, &user, &range, &window, &params).await
                })
                .await,
                $chart,
            )
        }
    };
}

chart!(
    handle_get_artists,
    "/1/stats/user/{user_name}/artists",
    "artists",
    get_top_artists
);
chart!(
    handle_get_releases,
    "/1/stats/user/{user_name}/releases",
    "releases",
    get_top_releases
);
chart!(
    handle_get_recordings,
    "/1/stats/user/{user_name}/recordings",
    "recordings",
    get_top_recordings
);
chart!(
    handle_get_release_groups,
    "/1/stats/user/{user_name}/release-groups",
    "release-groups",
    get_top_release_groups
);

#[get("/1/stats/user/{user_name}/listening-activity")]
pub async fn handle_get_listening_activity(
    data: web::Data<Arc<Backend>>,
    cache: web::Data<Cache>,
    user_name: web::Path<String>,
    query: web::Query<StatsQuery>,
) -> impl Responder {
    let db = data.get_ref();
    let user = match resolve(db, &user_name).await {
        Ok(user) => user,
        Err(response) => return *response,
    };
    let window = match window_for(query.range()) {
        Ok(window) => window,
        Err(response) => return *response,
    };

    let key = query.cache_key("listening-activity", &user);
    let range = query.range().to_string();
    answer(
        cached(cache.get_ref(), key, async {
            get_listening_activity(db, &user, &range, &window).await
        })
        .await,
        "listening activity",
    )
}
