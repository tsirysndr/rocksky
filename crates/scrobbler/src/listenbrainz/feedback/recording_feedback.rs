//! `POST /1/feedback/recording-feedback` — loving and unloving a track.
//!
//! # Why this goes back out over HTTP
//!
//! A like is not a database row: it is a record in the user's own repository,
//! written through their PDS session, and the appview projects a row from it
//! afterwards. This service holds no session and has no business minting one,
//! so it does what every other write here does — calls the Rocksky API with a
//! token for the user, at `POST /likes` and `DELETE /likes/{sha256}`, the
//! same pair the Subsonic and Jellyfin front ends use for exactly this.
//!
//! Writing `loved_tracks` directly instead would produce a like that no other
//! client can see and that the next sync would delete.

use anyhow::Error;
use rocksky_db::models::Track;
use serde_json::json;

use crate::auth::generate_token;
use crate::rocksky::ROCKSKY_API;

/// Applies a feedback score to `track` on behalf of `did`.
///
/// Any score above zero is a love; zero and below clear it, which folds
/// ListenBrainz's "hate" into "not loved" — the nearest thing this catalogue
/// can record.
pub async fn apply(did: &str, track: &Track, score: i32) -> Result<(), Error> {
    let token = generate_token(did)?;
    let client = reqwest::Client::new();

    let response = if score > 0 {
        client
            .post(format!("{}/likes", ROCKSKY_API))
            .bearer_auth(token)
            // The API hashes these four back into the same row the catalogue
            // holds, so all four have to be sent — a like on a song with no
            // album cannot be hashed to the row a scrobble of it produced.
            .json(&json!({
                "title": track.title,
                "artist": track.artist,
                "album": track.album,
                "albumArtist": track.album_artist,
                "albumArt": track.album_art,
                "duration": track.duration,
                "trackNumber": track.track_number,
                "discNumber": track.disc_number,
                "mbId": track.mb_id,
                "isrc": track.isrc,
            }))
            .send()
            .await?
    } else {
        client
            .delete(format!("{}/likes/{}", ROCKSKY_API, track.sha256))
            .bearer_auth(token)
            .send()
            .await?
    };

    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        return Err(Error::msg(format!(
            "the Rocksky API refused the feedback ({}): {}",
            status, body
        )));
    }

    tracing::info!(
        did = %did,
        title = %track.title,
        artist = %track.artist,
        score = score,
        "recorded ListenBrainz feedback"
    );
    Ok(())
}
