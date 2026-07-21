use actix_web::HttpResponse;
use sqlx::{Pool, Postgres};
use std::{
    collections::HashMap,
    env,
    sync::{Arc, Mutex, OnceLock},
    time::{Duration, Instant},
};

use crate::{repo, repo::track::StreamTrack, response, s3};

// Cache decrypted credentials keyed by the encrypted value — safe against
// credential rotation since the key changes when the stored bytes change.
static CRED_CACHE: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();

fn cred_cache() -> &'static Mutex<HashMap<String, String>> {
    CRED_CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

// Cache resolved stream rows keyed by "user_id:song_id" with a short TTL, so the
// HEAD+GET pair and repeat plays skip the Postgres lookup. TTL is well under the
// 3600s presign window, so cached BYO credentials never outlive their grant.
const TRACK_TTL: Duration = Duration::from_secs(300);

static TRACK_CACHE: OnceLock<Mutex<HashMap<String, (StreamTrack, Instant)>>> = OnceLock::new();

fn track_cache() -> &'static Mutex<HashMap<String, (StreamTrack, Instant)>> {
    TRACK_CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

async fn get_stream_track_cached(
    pool: &Arc<Pool<Postgres>>,
    song_id: &str,
    user_id: &str,
) -> Result<Option<StreamTrack>, anyhow::Error> {
    let cache_key = format!("{user_id}:{song_id}");

    {
        let cache = track_cache().lock().unwrap();
        if let Some((track, inserted)) = cache.get(&cache_key) {
            if inserted.elapsed() < TRACK_TTL {
                return Ok(Some(track.clone()));
            }
        }
    }

    let track = repo::track::get_stream_track_by_id(pool, song_id, user_id).await?;

    if let Some(ref t) = track {
        let mut cache = track_cache().lock().unwrap();
        cache.insert(cache_key, (t.clone(), Instant::now()));
    }

    Ok(track)
}

static ENC_KEY: OnceLock<String> = OnceLock::new();

fn enc_key() -> &'static str {
    ENC_KEY.get_or_init(|| env::var("STORAGE_ENCRYPTION_KEY").unwrap_or_else(|_| "0".repeat(64)))
}

fn decrypt_cached(encoded: &str) -> Result<String, anyhow::Error> {
    {
        let cache = cred_cache().lock().unwrap();
        if let Some(val) = cache.get(encoded) {
            return Ok(val.clone());
        }
    }
    let plaintext = s3::decrypt_credential(encoded, enc_key())?;
    {
        let mut cache = cred_cache().lock().unwrap();
        cache.insert(encoded.to_string(), plaintext.clone());
    }
    Ok(plaintext)
}

async fn resolve_url(track: &StreamTrack) -> Result<String, anyhow::Error> {
    if track.storage_provider_id.is_none() {
        return Ok(s3::public_url(&track.r2_key));
    }

    if let Some(ref pub_url) = track.storage_public_url {
        let key = track.r2_key.trim_start_matches('/');
        return Ok(format!("{}/{}", pub_url.trim_end_matches('/'), key));
    }

    let access_key = decrypt_cached(track.storage_access_key.as_deref().unwrap_or_default())?;
    let secret_key = decrypt_cached(track.storage_secret_key.as_deref().unwrap_or_default())?;

    s3::presign_get_with_creds(
        &track.r2_key,
        track.storage_endpoint.as_deref().unwrap_or_default(),
        track.storage_region.as_deref().unwrap_or("auto"),
        track.storage_bucket.as_deref().unwrap_or_default(),
        &access_key,
        &secret_key,
        3600,
    )
    .await
}

/// Resolve the object URL and hand the client a 302 straight to the CDN /
/// object store. The bytes never pass through this server, so seeking, range
/// requests and edge caching are all served by the origin.
async fn redirect(
    format: &str,
    user_id: &str,
    song_id: &str,
    pool: &Arc<Pool<Postgres>>,
) -> HttpResponse {
    let track = match get_stream_track_cached(pool, song_id, user_id).await {
        Ok(Some(t)) => t,
        Ok(None) => return response::err(format, 70, "Song not found"),
        Err(e) => {
            tracing::error!("stream lookup error: {}", e);
            return response::err(format, 0, "Internal server error");
        }
    };

    let url = match resolve_url(&track).await {
        Ok(u) => u,
        Err(e) => {
            tracing::error!("stream url resolve error: {}", e);
            return response::err(format, 0, "Failed to resolve audio URL");
        }
    };

    HttpResponse::Found()
        .append_header(("Location", url))
        .append_header(("Access-Control-Allow-Origin", "*"))
        .append_header(("Cache-Control", "no-cache"))
        .finish()
}

pub async fn handle_head(
    format: &str,
    user_id: &str,
    song_id: &str,
    pool: &Arc<Pool<Postgres>>,
) -> HttpResponse {
    redirect(format, user_id, song_id, pool).await
}

pub async fn handle(
    format: &str,
    user_id: &str,
    song_id: &str,
    pool: &Arc<Pool<Postgres>>,
    _range: Option<&str>,
) -> HttpResponse {
    redirect(format, user_id, song_id, pool).await
}
