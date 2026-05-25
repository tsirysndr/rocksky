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

    let genres: Option<Vec<String>> = track.genre.as_ref().map(|g| vec![g.clone()]);

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
        "timestamp": timestamp_unix,
        "genres": genres,
    });

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
