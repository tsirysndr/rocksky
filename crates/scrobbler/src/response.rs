use serde_json::{Value, json};

use crate::types::Scrobble;

pub fn build_response(scrobbles: Vec<Scrobble>) -> Value {
    json!({
        "scrobbles": {
            "@attr": {
                "accepted": scrobbles.len().to_string(),
                "ignored": "0"
            },
            "scrobble": scrobbles.iter().map(|s| json!({
                "artist": { "#text": s.artist, "corrected": "0" },
                "track": { "#text": s.track, "corrected": "0" },
                "album": { "#text": s.album.clone().unwrap_or_default(), "corrected": "0" },
                "timestamp": s.timestamp.to_string(),
                "ignoredMessage": {
                    "#text": "",
                    "code": match s.ignored {
                        Some(true) => "1",
                        Some(false) => "0",
                        None => "0"
                    }
             }
            })).collect::<Vec<_>>()
        }
    })
}
