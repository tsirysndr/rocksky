use actix_web::{web::Bytes, HttpResponse};
use futures::{stream, StreamExt};
use sqlx::{Pool, Postgres};
use std::{
    collections::HashMap,
    env,
    sync::{Arc, Mutex, OnceLock},
    time::Duration,
};

use crate::{repo, response, s3, xata::track::TrackWithUpload};

static HTTP_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();

fn http_client() -> &'static reqwest::Client {
    HTTP_CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .pool_max_idle_per_host(32)
            .pool_idle_timeout(Duration::from_secs(90))
            .tcp_keepalive(Duration::from_secs(60))
            .connect_timeout(Duration::from_secs(10))
            .build()
            .expect("failed to build HTTP client")
    })
}

// Cache decrypted credentials keyed by the encrypted value — safe against
// credential rotation since the key changes when the stored bytes change.
static CRED_CACHE: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();

fn cred_cache() -> &'static Mutex<HashMap<String, String>> {
    CRED_CACHE.get_or_init(|| Mutex::new(HashMap::new()))
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

async fn resolve_url(track: &TrackWithUpload) -> Result<String, anyhow::Error> {
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

pub async fn handle_head(
    format: &str,
    user_id: &str,
    song_id: &str,
    pool: &Arc<Pool<Postgres>>,
) -> HttpResponse {
    let track = match repo::track::get_track_by_id(pool, song_id, user_id).await {
        Ok(Some(t)) => t,
        Ok(None) => return response::err(format, 70, "Song not found"),
        Err(e) => {
            tracing::error!("stream HEAD lookup error: {}", e);
            return response::err(format, 0, "Internal server error");
        }
    };

    let url = match resolve_url(&track).await {
        Ok(u) => u,
        Err(e) => {
            tracing::error!("stream HEAD url resolve error: {}", e);
            return response::err(format, 0, "Failed to resolve audio URL");
        }
    };

    let upstream = match http_client().head(&url).send().await {
        Ok(r) => r,
        Err(e) => {
            tracing::error!("stream HEAD fetch error: {}", e);
            return response::err(format, 0, "Failed to fetch audio metadata");
        }
    };

    let status = actix_web::http::StatusCode::from_u16(upstream.status().as_u16())
        .unwrap_or(actix_web::http::StatusCode::OK);

    let mut builder = HttpResponse::build(status);
    builder.append_header(("Access-Control-Allow-Origin", "*"));
    builder.append_header(("Accept-Ranges", "bytes"));

    if let Some(val) = upstream.headers().get("Content-Type") {
        if let Ok(s) = val.to_str() {
            builder.append_header(("Content-Type", s));
        }
    }

    // SizedStream declares the Content-Length at the body level, which actix
    // uses when serializing headers. finish() / no_chunking() both lose because
    // actix overwrites Content-Length from the actual body size (0) afterwards.
    if let Some(val) = upstream.headers().get("Content-Length") {
        if let Ok(s) = val.to_str() {
            if let Ok(len) = s.parse::<u64>() {
                return builder.body(actix_web::body::SizedStream::new(
                    len,
                    stream::empty::<Result<Bytes, std::io::Error>>(),
                ));
            }
        }
    }

    builder.finish()
}

pub async fn handle(
    format: &str,
    user_id: &str,
    song_id: &str,
    pool: &Arc<Pool<Postgres>>,
    range: Option<&str>,
) -> HttpResponse {
    let track = match repo::track::get_track_by_id(pool, song_id, user_id).await {
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

    let mut req = http_client().get(&url);
    if let Some(range_val) = range {
        req = req.header("Range", range_val);
    }

    let upstream = match req.send().await {
        Ok(r) => r,
        Err(e) => {
            tracing::error!("stream fetch error: {}", e);
            return response::err(format, 0, "Failed to fetch audio");
        }
    };

    let status = actix_web::http::StatusCode::from_u16(upstream.status().as_u16())
        .unwrap_or(actix_web::http::StatusCode::OK);

    let mut builder = HttpResponse::build(status);
    builder.append_header(("Access-Control-Allow-Origin", "*"));
    builder.append_header(("Cache-Control", "no-cache"));

    let mut content_length: Option<u64> = None;
    for header_name in &[
        "Content-Type",
        "Content-Length",
        "Content-Range",
        "Accept-Ranges",
    ] {
        if let Some(val) = upstream.headers().get(*header_name) {
            if let Ok(s) = val.to_str() {
                if *header_name == "Content-Length" {
                    content_length = s.parse().ok();
                }
                builder.append_header((*header_name, s));
            }
        }
    }

    let stream = upstream.bytes_stream().map(|chunk| {
        chunk.map_err(|e| {
            let io_err: std::io::Error =
                std::io::Error::new(std::io::ErrorKind::Other, e.to_string());
            io_err
        })
    });

    if let Some(len) = content_length {
        builder.body(actix_web::body::SizedStream::new(len, stream))
    } else {
        builder.streaming(stream)
    }
}
