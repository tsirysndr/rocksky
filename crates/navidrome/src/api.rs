use anyhow::Error;
use chrono::Utc;
use jsonwebtoken::{EncodingKey, Header};
use serde::{Deserialize, Serialize};
use std::env;

use crate::xata::track::TrackWithUpload;

#[derive(Serialize, Deserialize)]
struct Claims {
    exp: usize,
    iat: usize,
    did: String,
}

fn generate_token(did: &str) -> Result<String, Error> {
    let secret = env::var("JWT_SECRET").map_err(|_| Error::msg("JWT_SECRET is not set"))?;
    let now = Utc::now().timestamp() as usize;
    let claims = Claims {
        exp: now + 3600,
        iat: now,
        did: did.to_string(),
    };
    jsonwebtoken::encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_ref()),
    )
    .map_err(Into::into)
}

/// Payload sent to the XRPC createScrobble endpoint.
/// Fields are skipped when None so the server never receives JSON null values.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ScrobblePayload {
    title: String,
    artist: String,
    album: String,
    album_artist: String,
    duration: i32,
    timestamp: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    album_art: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    track_number: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    disc_number: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    mb_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    genres: Option<Vec<String>>,
}

pub async fn post_like(did: String, track: TrackWithUpload) {
    let token = match generate_token(&did) {
        Ok(t) => t,
        Err(e) => {
            tracing::warn!("JWT generation failed, like not published: {}", e);
            return;
        }
    };

    let api_base =
        env::var("ROCKSKY_API_URL").unwrap_or_else(|_| "https://api.rocksky.app".to_string());

    let payload = serde_json::json!({
        "title": track.title,
        "artist": track.artist,
        "album": track.album,
        "albumArtist": track.album_artist,
        "duration": track.duration,
        "albumArt": track.album_art,
        "trackNumber": track.track_number,
        "discNumber": track.disc_number,
        "mbId": track.mb_id,
    });

    let url = format!("{}/likes", api_base);
    let client = reqwest::Client::new();
    match client
        .post(&url)
        .bearer_auth(&token)
        .json(&payload)
        .send()
        .await
    {
        Ok(r) if r.status().is_success() => {
            tracing::info!(did = %did, title = %track.title, "like posted via API");
        }
        Ok(r) => {
            let status = r.status();
            let text = r.text().await.unwrap_or_default();
            tracing::warn!(did = %did, %status, response = %text, "like API call failed");
        }
        Err(e) => tracing::warn!(did = %did, "like API request error: {}", e),
    }
}

pub async fn delete_like(did: String, sha256: String) {
    let token = match generate_token(&did) {
        Ok(t) => t,
        Err(e) => {
            tracing::warn!("JWT generation failed, unlike not published: {}", e);
            return;
        }
    };

    let api_base =
        env::var("ROCKSKY_API_URL").unwrap_or_else(|_| "https://api.rocksky.app".to_string());

    let url = format!("{}/likes/{}", api_base, sha256);
    let client = reqwest::Client::new();
    match client.delete(&url).bearer_auth(&token).send().await {
        Ok(r) if r.status().is_success() => {
            tracing::info!(did = %did, sha256 = %sha256, "unlike posted via API");
        }
        Ok(r) => {
            let status = r.status();
            let text = r.text().await.unwrap_or_default();
            tracing::warn!(did = %did, %status, response = %text, "unlike API call failed");
        }
        Err(e) => tracing::warn!(did = %did, "unlike API request error: {}", e),
    }
}

pub async fn post_now_playing(did: String, track: TrackWithUpload, timestamp_unix: i64) {
    let token = match generate_token(&did) {
        Ok(t) => t,
        Err(e) => {
            tracing::warn!(
                "JWT generation failed, scrobble not published to ATProto: {}",
                e
            );
            return;
        }
    };

    let api_base =
        env::var("ROCKSKY_API_URL").unwrap_or_else(|_| "https://api.rocksky.app".to_string());

    let payload = ScrobblePayload {
        title: track.title.clone(),
        artist: track.artist.clone(),
        album: track.album.clone(),
        album_artist: track.album_artist.clone(),
        duration: track.duration,
        timestamp: timestamp_unix,
        album_art: track.album_art.clone(),
        track_number: track.track_number,
        disc_number: track.disc_number,
        mb_id: track.mb_id.clone(),
        genres: track.genre.as_ref().map(|g| vec![g.clone()]),
    };

    let url = format!("{}/xrpc/app.rocksky.scrobble.createScrobble", api_base);
    tracing::info!(
        did = %did,
        url = %url,
        payload = %serde_json::to_string(&payload).unwrap_or_default(),
        "posting scrobble to XRPC"
    );

    let client = reqwest::Client::new();
    match client
        .post(&url)
        .bearer_auth(&token)
        .json(&payload)
        .send()
        .await
    {
        Ok(r) if r.status().is_success() => {
            tracing::info!(did = %did, title = %track.title, duration = track.duration, "scrobble submitted via XRPC");
        }
        Ok(r) => {
            let status = r.status();
            let text = r.text().await.unwrap_or_default();
            tracing::warn!(did = %did, %status, response = %text, "XRPC scrobble failed");
        }
        Err(e) => {
            tracing::warn!(did = %did, "XRPC scrobble request error: {}", e);
        }
    }
}
