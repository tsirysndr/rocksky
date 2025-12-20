use anyhow::Error;
use serde_json::{Value, json};

pub async fn get_playing_now(user_name: &str) -> Result<Value, Error> {
    let playing_now = json!({
        "payload": {
            "count": 1,
            "listens": [
                {
                    "playing_now": true,
                    "track_metadata": {
                        "additional_info": {
                            "duration": 170,
                            "music_service_name": "Spotify",
                            "origin_url": "https://open.spotify.com/track/26haJjtanhamtf25RXH0MO",
                            "spotify_id": "https://open.spotify.com/track/26haJjtanhamtf25RXH0MO",
                            "submission_client": "Web Scrobbler",
                            "submission_client_version": "3.14.0"
                        },
                        "artist_name": "Martin Solveig, ALMA",
                        "release_name": "All Stars",
                        "track_name": "All Stars"
                    }
                }
            ],
            "playing_now": true,
            "user_id": user_name
        }
    });
    Ok(playing_now)
}
