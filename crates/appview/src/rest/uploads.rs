//! `/uploads/*` — listing, streaming and deleting uploaded music.
//!
//! Audio is streamed *through* this server rather than by redirecting to the
//! bucket, so the object URL and the storage credentials never reach the
//! browser. That is also why `GET /uploads/{id}/stream` accepts an opaque
//! stream token as a query parameter: an `<audio>` element cannot send an
//! `Authorization` header, and putting the bearer token in a URL would leak a
//! full-privilege credential into history and logs. The stream token is
//! scoped to streaming and expires.
//!
//! Range requests are forwarded, which is what makes seeking work.

use crate::auth::{Auth, AuthDid};
use crate::db::models::{self, Track};
use crate::db::schema::{Albums, Tracks, UserUploads, Users};
use crate::db::Backend;
use crate::error::{XrpcError, XrpcResult};
use crate::sea_query::{Alias, Expr, JoinType, Order, Query, SelectStatement};
use crate::state::AppState;
use crate::storage;
use crate::uploads::{self, queue, AlbumSelector, Upload};
use actix_web::http::header::{
    ACCEPT_RANGES, CACHE_CONTROL, CONTENT_LENGTH, CONTENT_RANGE, CONTENT_TYPE, RANGE,
};
use actix_web::web::{self, ServiceConfig};
use actix_web::{HttpRequest, HttpResponse};
use serde::{Deserialize, Serialize};
use std::time::Duration;

pub fn configure(cfg: &mut ServiceConfig) {
    // `/uploads/album` and `/uploads/stream-token` are registered before the
    // `{id}` routes so they are not captured as an upload id.
    cfg.route("/uploads/stream-token", web::get().to(stream_token))
        .route("/uploads/queue", web::get().to(get_queue))
        .route("/uploads/queue", web::put().to(put_queue))
        .route("/uploads/album", web::delete().to(delete_album))
        .route(
            "/uploads/by-track/{track_id}",
            web::delete().to(delete_by_track),
        )
        .route(
            "/uploads/by-album/{album_id}",
            web::delete().to(delete_by_album),
        )
        .route("/uploads/{id}/stream", web::get().to(stream))
        .route("/uploads/{id}", web::delete().to(delete_one))
        .route("/uploads", web::get().to(list));
}

/// How long a stream token lasts. Matches `apps/api`'s hour.
const STREAM_TOKEN_TTL: Duration = Duration::from_secs(3600);

async fn caller_id(db: &Backend, did: &str) -> XrpcResult<String> {
    let query = Query::select()
        .column(Users::XataId)
        .from(Users::Table)
        .and_where(Expr::col(Users::Did).eq(did))
        .limit(1)
        .to_owned();

    db.fetch_scalar::<String>(&query)
        .await?
        .ok_or_else(|| XrpcError::auth_required("Unauthorized"))
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListQuery {
    #[serde(default)]
    pub size: Option<i64>,
    #[serde(default)]
    pub offset: Option<i64>,
    /// Full-text search over the caller's own uploads, served from the search
    /// index rather than from SQL — see [`list`].
    #[serde(default)]
    pub q: Option<String>,
    #[serde(default, with = "crate::views::uri")]
    pub album_uri: Option<String>,
    #[serde(default)]
    pub album_artist: Option<String>,
    #[serde(default)]
    pub album_name: Option<String>,
}

/// One row of `GET /uploads`.
///
/// Nested rather than flattened: Drizzle's `.select({ upload, track, … })`
/// returns an object per alias, and the UI reads `row.upload.id` and
/// `row.track.title`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadRow {
    pub upload: Upload,
    pub track: TrackView,
    pub album_release_date: Option<String>,
    pub album_year: Option<i64>,
}

pub use crate::views::TrackView;

/// `GET /uploads`
///
/// Lists the caller's uploads, optionally filtered to one album or narrowed by
/// `?q=`.
///
/// `?q=` is served from the search index, not from SQL. A `LIKE '%…%'` over the
/// joined tables would answer, but it would answer differently: no typo
/// tolerance, no relevance order, and a full scan per keystroke. The index is a
/// required dependency precisely so this endpoint does not have to choose
/// between those.
async fn list(
    state: web::Data<AppState>,
    auth: AuthDid,
    query: web::Query<ListQuery>,
) -> XrpcResult<HttpResponse> {
    let db = state.db();
    let user_id = caller_id(db, &auth.did).await?;

    let size = query.size.filter(|v| *v > 0).unwrap_or(50).min(200);
    let offset = query.offset.filter(|v| *v > 0).unwrap_or(0);

    if let Some(q) = query.q.as_deref().map(str::trim).filter(|q| !q.is_empty()) {
        return search_uploads(&state, &user_id, q, size, offset).await;
    }

    let album = AlbumSelector::parse(
        query.album_uri.as_deref(),
        query.album_artist.as_deref(),
        query.album_name.as_deref(),
    );

    let mut query = joined_uploads(db, &user_id);

    if let Some(album) = &album {
        query.and_where(album.condition());
    }

    // Within an album, track order is what matters; across the library it is
    // alphabetical.
    if album.is_some() {
        query.order_by((Alias::new("t"), Tracks::TrackNumber), Order::Asc);
    }
    query
        .order_by((Alias::new("t"), Tracks::Title), Order::Asc)
        .order_by((Alias::new("t"), Tracks::Artist), Order::Asc)
        .limit(size as u64)
        .offset(offset as u64);

    let rows: Vec<JoinedUploadRow> = db.fetch_all(&query).await?;

    Ok(HttpResponse::Ok().json(
        rows.into_iter()
            .map(|row| UploadRow {
                track: TrackView::from(&row.track()),
                upload: row.upload,
                album_release_date: row.album_release_date.clone(),
                album_year: row.album_year,
            })
            .collect::<Vec<_>>(),
    ))
}

/// One upload row joined to its track and its album, scoped to an owner.
///
/// The listing and the search both answer with the same object, so they build
/// on the same projection — `search_uploads` exists because the *ordering*
/// comes from the index, not because the row is different.
fn joined_uploads(db: &Backend, user_id: &str) -> SelectStatement {
    let mut query = Query::select();
    db.select_model(&mut query, uploads::UPLOAD_COLS, Some("u"));
    // The track's columns carry a `track_` alias prefix: both models alias
    // `xata_id AS id`, and sqlx would read whichever came first.
    db.select_model_aliased(&mut query, models::TRACK_COLS, Some("t"), "track_");

    query
        .expr_as(
            Expr::col((Alias::new("al"), Albums::ReleaseDate)),
            Alias::new("album_release_date"),
        )
        .expr_as(
            db.cast_int(Expr::col((Alias::new("al"), Albums::Year))),
            Alias::new("album_year"),
        )
        .from_as(UserUploads::Table, Alias::new("u"))
        .join_as(
            JoinType::InnerJoin,
            Tracks::Table,
            Alias::new("t"),
            Expr::col((Alias::new("t"), Tracks::XataId))
                .equals((Alias::new("u"), UserUploads::TrackId)),
        )
        // LEFT, because only the release date and year come from the album: a
        // track whose album has not been indexed yet still has an upload, and
        // an inner join would hide it.
        .join_as(
            JoinType::LeftJoin,
            Albums::Table,
            Alias::new("al"),
            Expr::col((Alias::new("al"), Albums::Uri)).equals((Alias::new("t"), Tracks::AlbumUri)),
        )
        .and_where(Expr::col((Alias::new("u"), UserUploads::UserId)).eq(user_id));
    query
}

/// The joined row.
///
/// The track's columns arrive under `track_`-prefixed aliases, because both
/// models alias `xata_id AS id` and `sqlx` would otherwise read whichever came
/// first. They are listed out rather than flattened: a second `#[sqlx(flatten)]`
/// cannot rename what it reads.
#[derive(sqlx::FromRow)]
struct JoinedUploadRow {
    #[sqlx(flatten)]
    upload: Upload,
    album_release_date: Option<String>,
    album_year: Option<i64>,

    track_id: String,
    track_title: String,
    track_artist: String,
    track_album_artist: String,
    track_album_art: Option<String>,
    track_album: String,
    track_track_number: Option<i64>,
    track_duration: i64,
    track_mb_id: Option<String>,
    track_isrc: Option<String>,
    track_youtube_link: Option<String>,
    track_spotify_link: Option<String>,
    track_apple_music_link: Option<String>,
    track_tidal_link: Option<String>,
    track_sha256: String,
    track_disc_number: Option<i64>,
    track_lyrics: Option<String>,
    track_composer: Option<String>,
    track_genre: Option<String>,
    track_label: Option<String>,
    track_copyright_message: Option<String>,
    track_key: Option<String>,
    track_bpm: Option<f64>,
    track_uri: Option<String>,
    track_album_uri: Option<String>,
    track_artist_uri: Option<String>,
    track_created_at: chrono::DateTime<chrono::Utc>,
    track_updated_at: chrono::DateTime<chrono::Utc>,
    track_xata_version: Option<i64>,
}

impl JoinedUploadRow {
    fn track(&self) -> Track {
        Track {
            id: self.track_id.clone(),
            title: self.track_title.clone(),
            artist: self.track_artist.clone(),
            album_artist: self.track_album_artist.clone(),
            album_art: self.track_album_art.clone(),
            album: self.track_album.clone(),
            track_number: self.track_track_number,
            duration: self.track_duration,
            mb_id: self.track_mb_id.clone(),
            isrc: self.track_isrc.clone(),
            youtube_link: self.track_youtube_link.clone(),
            spotify_link: self.track_spotify_link.clone(),
            apple_music_link: self.track_apple_music_link.clone(),
            tidal_link: self.track_tidal_link.clone(),
            sha256: self.track_sha256.clone(),
            disc_number: self.track_disc_number,
            lyrics: self.track_lyrics.clone(),
            composer: self.track_composer.clone(),
            genre: self.track_genre.clone(),
            label: self.track_label.clone(),
            copyright_message: self.track_copyright_message.clone(),
            key: self.track_key.clone(),
            bpm: self.track_bpm,
            uri: self.track_uri.clone(),
            album_uri: self.track_album_uri.clone(),
            artist_uri: self.track_artist_uri.clone(),
            created_at: self.track_created_at,
            updated_at: self.track_updated_at,
            xata_version: self.track_xata_version,
        }
    }
}

/// `GET /uploads?q=…`
///
/// The index decides *which* uploads and in what order; the database then
/// provides the rows. Going back to the database rather than answering from the
/// index documents is deliberate: the document holds a subset of the columns,
/// so serving it directly would return rows shaped differently from the
/// unfiltered listing — the same endpoint answering with a different object
/// depending on whether a search box had text in it. `apps/api` does exactly
/// that, and it is the kind of difference a client only discovers in
/// production.
async fn search_uploads(
    state: &AppState,
    user_id: &str,
    query: &str,
    size: i64,
    offset: i64,
) -> XrpcResult<HttpResponse> {
    let Some(search) = state.search() else {
        // Only reachable under test — the index is required at boot.
        tracing::warn!("upload search was called with no index configured");
        return Ok(HttpResponse::Ok().json(Vec::<UploadRow>::new()));
    };

    let documents = search
        .library_tracks(query, user_id, size, offset)
        .await
        .map_err(|err| {
            tracing::error!(error = %err, query, "searching uploads failed");
            XrpcError::with_message(
                crate::error::ResponseType::UpstreamFailure,
                "The search index is unavailable.",
            )
            .named("SearchFailed")
        })?;

    if documents.is_empty() {
        return Ok(HttpResponse::Ok().json(Vec::<UploadRow>::new()));
    }

    let ranked: Vec<String> = documents.into_iter().map(|doc| doc.id).collect();
    let db = state.db();

    // Scoped to the caller as well as to the ids: `joined_uploads` filters by
    // `user_id`, and the index filters by it too, but one authorization check
    // in the query that actually returns the rows beats trusting a filter
    // expression evaluated in a second system.
    let mut query = joined_uploads(db, user_id);
    query.and_where(
        Expr::col((Alias::new("u"), UserUploads::XataId)).is_in(ranked.iter().map(String::as_str)),
    );

    let rows: Vec<JoinedUploadRow> = db.fetch_all(&query).await?;

    // Back into relevance order. `IN` has no order of its own, and the ranking
    // is the whole point of having searched.
    let mut by_id: std::collections::HashMap<String, JoinedUploadRow> = rows
        .into_iter()
        .map(|row| (row.upload.id.clone(), row))
        .collect();

    let ordered: Vec<UploadRow> = ranked
        .iter()
        // A document whose row has since been deleted is skipped rather than
        // reported: the index catches up, and a stale hit is not the caller's
        // problem.
        .filter_map(|id| by_id.remove(id))
        .map(|row| UploadRow {
            track: TrackView::from(&row.track()),
            upload: row.upload,
            album_release_date: row.album_release_date.clone(),
            album_year: row.album_year,
        })
        .collect();

    Ok(HttpResponse::Ok().json(ordered))
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamTokenResponse {
    pub token: String,
    pub expires_in: u64,
}

/// `GET /uploads/stream-token`
///
/// Mints a short-lived, streaming-only credential for `<audio src>`.
async fn stream_token(state: web::Data<AppState>, auth: AuthDid) -> XrpcResult<HttpResponse> {
    let user_id = caller_id(state.db(), &auth.did).await?;

    // 20 random bytes as hex, as `apps/api` does.
    let token = {
        use rand::RngCore;
        let mut bytes = [0u8; 20];
        rand::thread_rng().fill_bytes(&mut bytes);
        hex::encode(bytes)
    };

    state
        .cache()
        .set_ex(&stream_key(&token), STREAM_TOKEN_TTL, &user_id)
        .await;

    Ok(HttpResponse::Ok().json(StreamTokenResponse {
        token,
        expires_in: STREAM_TOKEN_TTL.as_secs(),
    }))
}

fn stream_key(token: &str) -> String {
    format!("stream:{token}")
}

#[derive(Debug, Clone, Deserialize)]
pub struct StreamQuery {
    #[serde(default)]
    pub token: Option<String>,
}

/// `GET /uploads/{id}/stream`
///
/// Authenticated by either a stream token in `?token=` or a bearer header.
/// Range requests are forwarded so the player can seek.
async fn stream(
    state: web::Data<AppState>,
    auth: Auth,
    path: web::Path<String>,
    query: web::Query<StreamQuery>,
    req: HttpRequest,
) -> XrpcResult<HttpResponse> {
    let db = state.db();

    // A stream token takes precedence, since that is what the audio element
    // sends; a bearer header is the fallback for a direct caller.
    let user_id = match query.token.as_deref().filter(|t| !t.is_empty()) {
        Some(token) => state
            .cache()
            .get(&stream_key(token))
            .await
            .ok_or_else(|| XrpcError::auth_required("Unauthorized"))?,
        None => caller_id(db, auth.require_did()?).await?,
    };

    let upload_id = path.into_inner();
    let upload = uploads::find(db, &user_id, &upload_id)
        .await?
        .ok_or_else(|| XrpcError::not_found("Upload not found"))?;

    let target = storage::resolve(
        db,
        state.config().s3.as_ref(),
        state.storage_encryption_key(),
        &user_id,
        upload.storage_provider_id.as_deref(),
    )
    .await
    .map_err(|err| match err {
        storage::StorageError::NotConfigured => XrpcError::not_configured("Object storage"),
        other => XrpcError::internal(anyhow::anyhow!(other)),
    })?;

    let range = req
        .headers()
        .get(RANGE)
        .and_then(|value| value.to_str().ok())
        .and_then(parse_range);

    // `get_object_range` is used for a range request so only the asked-for
    // bytes cross the wire; a full request streams the object.
    let (bytes, status, content_range) = match range {
        Some((start, end)) => {
            let response = target
                .bucket
                .get_object_range(&upload.r2_key, start, end)
                .await
                .map_err(|err| XrpcError::internal(anyhow::anyhow!(err)))?;
            let total = response
                .headers()
                .get("content-range")
                .cloned()
                .or_else(|| {
                    // The service did not say, so report what was actually
                    // returned rather than inventing a total.
                    Some(format!(
                        "bytes {}-{}/*",
                        start,
                        start + response.bytes().len().saturating_sub(1) as u64
                    ))
                });
            (response.to_vec(), 206, total)
        }
        None => {
            let response = target
                .bucket
                .get_object(&upload.r2_key)
                .await
                .map_err(|err| XrpcError::internal(anyhow::anyhow!(err)))?;
            (response.to_vec(), 200, None)
        }
    };

    let mut builder = HttpResponse::build(
        actix_web::http::StatusCode::from_u16(status).unwrap_or(actix_web::http::StatusCode::OK),
    );
    builder
        .insert_header((CONTENT_TYPE, upload.mime_type.clone()))
        .insert_header((ACCEPT_RANGES, "bytes"))
        // Private: this is someone's own library, not shared content.
        .insert_header((CACHE_CONTROL, "private, max-age=3600"))
        .insert_header((CONTENT_LENGTH, bytes.len().to_string()));

    if let Some(content_range) = content_range {
        builder.insert_header((CONTENT_RANGE, content_range));
    }

    Ok(builder.body(bytes))
}

/// Parses a `Range: bytes=start-end` header.
///
/// Only the single-range byte form is handled, which is all a media element
/// sends. A suffix range (`bytes=-500`) is not expressible through
/// `get_object_range`, so it is treated as absent and the whole object is
/// returned — correct, if less efficient.
fn parse_range(header: &str) -> Option<(u64, Option<u64>)> {
    let spec = header.trim().strip_prefix("bytes=")?;
    // Multiple ranges are legal but no player asks for them.
    let spec = spec.split(',').next()?.trim();
    let (start, end) = spec.split_once('-')?;

    let start: u64 = start.trim().parse().ok()?;
    let end = end.trim();
    let end = if end.is_empty() {
        None
    } else {
        let end: u64 = end.parse().ok()?;
        // An inverted range is malformed; ignore it rather than asking the
        // bucket for something impossible.
        if end < start {
            return None;
        }
        Some(end)
    };
    Some((start, end))
}

/// `GET /uploads/queue`
async fn get_queue(state: web::Data<AppState>, auth: AuthDid) -> XrpcResult<HttpResponse> {
    let db = state.db();
    let user_id = caller_id(db, &auth.did).await?;
    Ok(HttpResponse::Ok().json(queue::load(db, &user_id).await?))
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveQueue {
    pub upload_ids: Vec<String>,
    pub current_index: i64,
}

/// `PUT /uploads/queue`
async fn put_queue(
    state: web::Data<AppState>,
    auth: AuthDid,
    body: web::Json<SaveQueue>,
) -> XrpcResult<HttpResponse> {
    let db = state.db();
    let user_id = caller_id(db, &auth.did).await?;

    queue::save(db, &user_id, &body.upload_ids, body.current_index).await?;
    Ok(HttpResponse::Ok().json(serde_json::json!({ "status": "ok" })))
}

#[derive(Debug, Serialize)]
pub struct DeleteResult {
    pub status: &'static str,
    pub deleted: u64,
}

/// Deletes the objects and the rows, then drops the documents.
///
/// Every delete route goes through here, which is what keeps the index from
/// drifting: unindexing at four call sites would eventually miss one.
///
/// The index comes last. A document that outlives its row is a search hit the
/// listing then filters away — untidy but harmless. A row deleted after its
/// document would be a track missing from search while it is still playable,
/// which is worse, so the order is not arbitrary.
async fn purge(state: &AppState, user_id: &str, uploads: &[Upload]) -> XrpcResult<u64> {
    let deleted = uploads::purge(
        state.db(),
        state.config().s3.as_ref(),
        state.storage_encryption_key(),
        user_id,
        uploads,
    )
    .await?;

    let ids: Vec<String> = uploads.iter().map(|upload| upload.id.clone()).collect();
    crate::search::remove_uploads(state, &ids).await;

    Ok(deleted)
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlbumQuery {
    #[serde(default, with = "crate::views::uri")]
    pub album_uri: Option<String>,
    #[serde(default)]
    pub album_artist: Option<String>,
    #[serde(default)]
    pub album_name: Option<String>,
}

/// `DELETE /uploads/album?albumUri=…` or `?albumArtist=…&albumName=…`
async fn delete_album(
    state: web::Data<AppState>,
    auth: AuthDid,
    query: web::Query<AlbumQuery>,
) -> XrpcResult<HttpResponse> {
    let db = state.db();
    let user_id = caller_id(db, &auth.did).await?;

    let selector = AlbumSelector::parse(
        query.album_uri.as_deref(),
        query.album_artist.as_deref(),
        query.album_name.as_deref(),
    )
    .ok_or_else(|| {
        XrpcError::invalid_request("albumUri or albumArtist + albumName is required")
            .named("MISSING_ALBUM")
    })?;

    let found = uploads::find_by_album(db, &user_id, &selector).await?;
    let deleted = purge(&state, &user_id, &found).await?;

    Ok(HttpResponse::Ok().json(DeleteResult {
        status: "ok",
        deleted,
    }))
}

/// `DELETE /uploads/by-track/{track_id}`
async fn delete_by_track(
    state: web::Data<AppState>,
    auth: AuthDid,
    path: web::Path<String>,
) -> XrpcResult<HttpResponse> {
    let db = state.db();
    let user_id = caller_id(db, &auth.did).await?;
    let track_id = path.into_inner();

    let found = uploads::find_by_track(db, &user_id, &track_id).await?;
    if found.is_empty() {
        return Err(XrpcError::not_found("Upload not found"));
    }
    purge(&state, &user_id, &found).await?;

    Ok(HttpResponse::Ok().json(serde_json::json!({ "status": "ok" })))
}

/// `DELETE /uploads/by-album/{album_id}`
async fn delete_by_album(
    state: web::Data<AppState>,
    auth: AuthDid,
    path: web::Path<String>,
) -> XrpcResult<HttpResponse> {
    let db = state.db();
    let user_id = caller_id(db, &auth.did).await?;
    let album_id = path.into_inner();

    let found = uploads::find_by_album_id(db, &user_id, &album_id).await?;
    let deleted = purge(&state, &user_id, &found).await?;

    Ok(HttpResponse::Ok().json(DeleteResult {
        status: "ok",
        deleted,
    }))
}

/// `DELETE /uploads/{id}`
async fn delete_one(
    state: web::Data<AppState>,
    auth: AuthDid,
    path: web::Path<String>,
) -> XrpcResult<HttpResponse> {
    let db = state.db();
    let user_id = caller_id(db, &auth.did).await?;
    let upload_id = path.into_inner();

    let upload = uploads::find(db, &user_id, &upload_id)
        .await?
        .ok_or_else(|| XrpcError::not_found("Upload not found"))?;
    purge(&state, &user_id, &[upload]).await?;

    Ok(HttpResponse::Ok().json(serde_json::json!({ "status": "ok" })))
}

#[cfg(test)]
mod tests {
    use super::*;
    use actix_web::{test, App};

    macro_rules! app {
        ($state:expr) => {
            test::init_service(
                App::new()
                    .app_data($state.clone())
                    .app_data(web::Data::new($state.clone()))
                    .configure(configure),
            )
            .await
        };
    }

    async fn signed_in() -> (AppState, String, String) {
        let state = AppState::for_test().await.unwrap();
        let user_id = crate::ingest::upsert_user(state.db(), "did:plc:alice")
            .await
            .unwrap();
        let token =
            crate::rest::auth::mint_token(&state.config().jwt_secret, "did:plc:alice").unwrap();

        let db = state.db();
        db.execute(&db.sql(
            "INSERT INTO albums (xata_id, title, artist, sha256, uri, year, release_date) VALUES \
             ('rec_album', 'MHTRTC', 'BoC', 'sha-al', 'at://album/1', 1998, '1998-04-20')",
        ))
        .await
        .unwrap();
        db.execute(&db.sql(
            "INSERT INTO tracks \
             (xata_id, title, artist, album_artist, album, duration, sha256, album_uri, \
              track_number) VALUES \
             ('rec_t1', 'Roygbiv', 'BoC', 'BoC', 'MHTRTC', 151000, 'sha-t1', 'at://album/1', 4), \
             ('rec_t2', 'Olson', 'BoC', 'BoC', 'MHTRTC', 90000, 'sha-t2', 'at://album/1', 2)",
        ))
        .await
        .unwrap();

        for (id, track) in [("rec_u1", "rec_t1"), ("rec_u2", "rec_t2")] {
            let mut sql = db.sql(
                "INSERT INTO user_uploads \
                 (xata_id, user_id, track_id, r2_key, mime_type, file_size, original_filename) \
                 VALUES (",
            );
            sql.bind(id)
                .push(", ")
                .bind(&user_id)
                .push(", ")
                .bind(track)
                .push(", ")
                .bind(format!("music/{id}.flac"))
                .push(", ")
                .bind("audio/flac")
                .push(", ")
                .bind(4242i64)
                .push(", ")
                .bind(format!("{id}.flac"))
                .push(")");
            db.execute(&sql).await.unwrap();
        }

        (state, token, user_id)
    }

    #[actix_web::test]
    async fn every_route_requires_authentication() {
        let state = AppState::for_test().await.unwrap();
        let app = app!(state);

        for request in [
            test::TestRequest::get().uri("/uploads").to_request(),
            test::TestRequest::get()
                .uri("/uploads/stream-token")
                .to_request(),
            test::TestRequest::get().uri("/uploads/queue").to_request(),
            test::TestRequest::delete()
                .uri("/uploads/rec_u1")
                .to_request(),
        ] {
            let res = test::call_service(&app, request).await;
            assert_eq!(res.status(), 401);
        }
    }

    #[actix_web::test]
    async fn uploads_are_listed_with_their_track_and_album() {
        let (state, token, _user_id) = signed_in().await;
        let app = app!(state);

        let res = test::call_service(
            &app,
            test::TestRequest::get()
                .uri("/uploads")
                .insert_header(("authorization", format!("Bearer {token}")))
                .to_request(),
        )
        .await;
        assert_eq!(res.status(), 200);

        let body: serde_json::Value = test::read_body_json(res).await;
        assert_eq!(body.as_array().unwrap().len(), 2);

        // Nested, as Drizzle's aliased select returns it.
        assert_eq!(body[0]["upload"]["r2Key"], "music/rec_u2.flac");
        assert_eq!(body[0]["upload"]["fileSize"], 4242);
        assert_eq!(body[0]["track"]["title"], "Olson");
        // The nested track must be camelCase like everything else on the
        // wire, not the snake_case of the underlying row model.
        assert_eq!(body[0]["track"]["albumArtist"], "BoC");
        assert!(body[0]["track"].get("album_artist").is_none());
        // Album metadata is joined in.
        assert_eq!(body[0]["albumYear"], 1998);
        assert_eq!(body[0]["albumReleaseDate"], "1998-04-20");

        // Library order is alphabetical: Olson before Roygbiv.
        assert_eq!(body[1]["track"]["title"], "Roygbiv");
    }

    #[actix_web::test]
    async fn an_album_listing_is_ordered_by_track_number() {
        let (state, token, _user_id) = signed_in().await;
        let app = app!(state);

        let res = test::call_service(
            &app,
            test::TestRequest::get()
                .uri("/uploads?albumUri=at://album/1")
                .insert_header(("authorization", format!("Bearer {token}")))
                .to_request(),
        )
        .await;
        let body: serde_json::Value = test::read_body_json(res).await;

        // By track number, not by title.
        assert_eq!(body[0]["track"]["trackNumber"], 2);
        assert_eq!(body[1]["track"]["trackNumber"], 4);
    }

    /// `?q=` must go to the index, not fall through to the unfiltered listing.
    ///
    /// The test state has no index, so the answer is empty — the point is that
    /// it is *empty* rather than the whole library. Ignoring an unsupported
    /// filter and returning everything is the failure this guards: it looks
    /// like a search that matches everything, which is far harder to notice
    /// than no results.
    #[actix_web::test]
    async fn full_text_search_does_not_fall_back_to_listing_everything() {
        let (state, token, _user_id) = signed_in().await;
        let app = app!(state);

        let res = test::call_service(
            &app,
            test::TestRequest::get()
                .uri("/uploads?q=roygbiv")
                .insert_header(("authorization", format!("Bearer {token}")))
                .to_request(),
        )
        .await;
        assert_eq!(res.status(), 200);

        let body: serde_json::Value = test::read_body_json(res).await;
        assert_eq!(
            body.as_array().map(Vec::len),
            Some(0),
            "the fixture has two uploads; a search must not return them untouched: {body}"
        );
    }

    /// Without `?q=` the same route still lists everything.
    #[actix_web::test]
    async fn an_empty_search_term_still_lists_the_library() {
        let (state, token, _user_id) = signed_in().await;
        let app = app!(state);

        // A cleared search box sends `?q=`, which must mean "no filter" rather
        // than "search for nothing".
        let res = test::call_service(
            &app,
            test::TestRequest::get()
                .uri("/uploads?q=")
                .insert_header(("authorization", format!("Bearer {token}")))
                .to_request(),
        )
        .await;
        assert_eq!(res.status(), 200);

        let body: serde_json::Value = test::read_body_json(res).await;
        assert_eq!(body.as_array().map(Vec::len), Some(2), "{body}");
    }

    #[actix_web::test]
    async fn a_stream_token_is_minted_and_resolves_to_the_caller() {
        let (state, token, user_id) = signed_in().await;
        let app = app!(state);

        let res = test::call_service(
            &app,
            test::TestRequest::get()
                .uri("/uploads/stream-token")
                .insert_header(("authorization", format!("Bearer {token}")))
                .to_request(),
        )
        .await;
        assert_eq!(res.status(), 200);

        let body: serde_json::Value = test::read_body_json(res).await;
        let stream = body["token"].as_str().expect("token").to_string();
        assert_eq!(stream.len(), 40, "20 random bytes as hex");
        assert_eq!(body["expiresIn"], 3600);

        // It is a streaming-only credential: it maps to the user id, and is
        // not itself a bearer token.
        assert_eq!(
            state.cache().get(&stream_key(&stream)).await.as_deref(),
            Some(user_id.as_str())
        );
        assert!(
            crate::auth::jwt::verify_token(state.db(), &state.config().jwt_secret, &stream)
                .await
                .is_err(),
            "a stream token must not work as a bearer token"
        );
    }

    #[actix_web::test]
    async fn streaming_rejects_an_unknown_stream_token() {
        let (state, _token, _user_id) = signed_in().await;
        let app = app!(state);

        let res = test::call_service(
            &app,
            test::TestRequest::get()
                .uri("/uploads/rec_u1/stream?token=deadbeef")
                .to_request(),
        )
        .await;
        assert_eq!(res.status(), 401);
    }

    #[actix_web::test]
    async fn streaming_someone_elses_upload_is_a_404() {
        let (state, _token, _user_id) = signed_in().await;
        crate::ingest::upsert_user(state.db(), "did:plc:bob")
            .await
            .unwrap();
        let bob = crate::rest::auth::mint_token(&state.config().jwt_secret, "did:plc:bob").unwrap();
        let app = app!(state);

        let res = test::call_service(
            &app,
            test::TestRequest::get()
                .uri("/uploads/rec_u1/stream")
                .insert_header(("authorization", format!("Bearer {bob}")))
                .to_request(),
        )
        .await;
        assert_eq!(res.status(), 404, "not 403 — the row is simply not theirs");
    }

    #[actix_web::test]
    async fn streaming_without_storage_configured_says_so() {
        let (state, token, _user_id) = signed_in().await;
        assert!(state.config().s3.is_none());
        let app = app!(state);

        let res = test::call_service(
            &app,
            test::TestRequest::get()
                .uri("/uploads/rec_u1/stream")
                .insert_header(("authorization", format!("Bearer {token}")))
                .to_request(),
        )
        .await;
        assert_eq!(res.status(), 501);
        let body: serde_json::Value = test::read_body_json(res).await;
        assert_eq!(body["error"], "NotConfigured");
    }

    // `use actix_web::test` shadows the built-in `#[test]` attribute.
    #[actix_web::test]
    async fn range_headers_are_parsed() {
        assert_eq!(parse_range("bytes=0-1023"), Some((0, Some(1023))));
        assert_eq!(parse_range("bytes=1024-"), Some((1024, None)));
        assert_eq!(parse_range(" bytes=5-10 "), Some((5, Some(10))));
        // Only the first range of a multi-range request.
        assert_eq!(parse_range("bytes=0-99,200-299"), Some((0, Some(99))));

        // A suffix range cannot be expressed as a start offset, so it reads as
        // absent and the whole object is served.
        assert_eq!(parse_range("bytes=-500"), None);
        // Malformed or inverted.
        assert_eq!(parse_range("bytes=10-5"), None);
        assert_eq!(parse_range("items=0-10"), None);
        assert_eq!(parse_range("bytes=abc-def"), None);
        assert_eq!(parse_range(""), None);
    }

    #[actix_web::test]
    async fn the_queue_round_trips_through_the_api() {
        let (state, token, _user_id) = signed_in().await;
        let app = app!(state);
        let auth = ("authorization", format!("Bearer {token}"));

        let res = test::call_service(
            &app,
            test::TestRequest::put()
                .uri("/uploads/queue")
                .insert_header(auth.clone())
                .set_json(serde_json::json!({
                    "uploadIds": ["rec_u2", "rec_u1"],
                    "currentIndex": 1,
                }))
                .to_request(),
        )
        .await;
        assert_eq!(res.status(), 200);

        let res = test::call_service(
            &app,
            test::TestRequest::get()
                .uri("/uploads/queue")
                .insert_header(auth)
                .to_request(),
        )
        .await;
        let body: serde_json::Value = test::read_body_json(res).await;
        assert_eq!(body["currentIndex"], 1);
        assert_eq!(body["queue"][0]["uploadId"], "rec_u2");
        assert_eq!(body["queue"][0]["title"], "Olson");
        assert_eq!(body["queue"][1]["uploadId"], "rec_u1");
    }

    #[actix_web::test]
    async fn an_empty_queue_is_returned_before_anything_is_saved() {
        let (state, token, _user_id) = signed_in().await;
        let app = app!(state);

        let res = test::call_service(
            &app,
            test::TestRequest::get()
                .uri("/uploads/queue")
                .insert_header(("authorization", format!("Bearer {token}")))
                .to_request(),
        )
        .await;
        assert_eq!(res.status(), 200);
        let body: serde_json::Value = test::read_body_json(res).await;
        assert_eq!(body["queue"], serde_json::json!([]));
        assert_eq!(body["currentIndex"], 0);
    }

    #[actix_web::test]
    async fn deleting_an_upload_leaves_the_track_behind() {
        let (state, token, _user_id) = signed_in().await;
        let app = app!(state);

        let res = test::call_service(
            &app,
            test::TestRequest::delete()
                .uri("/uploads/rec_u1")
                .insert_header(("authorization", format!("Bearer {token}")))
                .to_request(),
        )
        .await;
        assert_eq!(res.status(), 200);

        let db = state.db();
        assert_eq!(
            db.count(&db.sql("SELECT count(*) FROM user_uploads"))
                .await
                .unwrap(),
            1
        );
        // The listening record must survive losing the audio.
        assert_eq!(
            db.count(&db.sql("SELECT count(*) FROM tracks"))
                .await
                .unwrap(),
            2
        );
    }

    #[actix_web::test]
    async fn deleting_an_album_removes_every_upload_on_it() {
        let (state, token, _user_id) = signed_in().await;
        let app = app!(state);

        let res = test::call_service(
            &app,
            test::TestRequest::delete()
                .uri("/uploads/album?albumUri=at://album/1")
                .insert_header(("authorization", format!("Bearer {token}")))
                .to_request(),
        )
        .await;
        assert_eq!(res.status(), 200);
        let body: serde_json::Value = test::read_body_json(res).await;
        assert_eq!(body["deleted"], 2);

        let db = state.db();
        assert_eq!(
            db.count(&db.sql("SELECT count(*) FROM user_uploads"))
                .await
                .unwrap(),
            0
        );
    }

    #[actix_web::test]
    async fn deleting_an_album_needs_it_to_be_identified() {
        let (state, token, _user_id) = signed_in().await;
        let app = app!(state);

        let res = test::call_service(
            &app,
            test::TestRequest::delete()
                // An artist with no album name identifies nothing.
                .uri("/uploads/album?albumArtist=BoC")
                .insert_header(("authorization", format!("Bearer {token}")))
                .to_request(),
        )
        .await;
        assert_eq!(res.status(), 400);
        let body: serde_json::Value = test::read_body_json(res).await;
        assert_eq!(body["error"], "MISSING_ALBUM");
    }

    #[actix_web::test]
    async fn deleting_by_track_reports_a_missing_upload() {
        let (state, token, _user_id) = signed_in().await;
        let app = app!(state);

        let res = test::call_service(
            &app,
            test::TestRequest::delete()
                .uri("/uploads/by-track/rec_nope")
                .insert_header(("authorization", format!("Bearer {token}")))
                .to_request(),
        )
        .await;
        assert_eq!(res.status(), 404);
    }

    #[actix_web::test]
    async fn one_account_cannot_delete_anothers_upload() {
        let (state, _token, _user_id) = signed_in().await;
        crate::ingest::upsert_user(state.db(), "did:plc:bob")
            .await
            .unwrap();
        let bob = crate::rest::auth::mint_token(&state.config().jwt_secret, "did:plc:bob").unwrap();
        let app = app!(state);

        let res = test::call_service(
            &app,
            test::TestRequest::delete()
                .uri("/uploads/rec_u1")
                .insert_header(("authorization", format!("Bearer {bob}")))
                .to_request(),
        )
        .await;
        assert_eq!(res.status(), 404);

        let db = state.db();
        assert_eq!(
            db.count(&db.sql("SELECT count(*) FROM user_uploads"))
                .await
                .unwrap(),
            2,
            "nothing of Alice's went"
        );
    }
}
