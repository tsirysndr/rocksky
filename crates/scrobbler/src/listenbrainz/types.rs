use std::collections::HashMap;

use serde::Deserialize;
use serde_json::Value;

#[derive(Deserialize, Debug, Clone)]
pub struct AdditionalInfo {
    pub release_name: Option<String>,
    pub musicbrainz_artist_id: Option<String>,
    pub musicbrainz_track_id: Option<String>,
    pub duration_ms: Option<f64>,
    pub media_player: Option<String>,
    pub submission_client: Option<String>,
    #[serde(flatten)]
    pub extra: HashMap<String, Value>,
}

#[derive(Deserialize, Debug, Clone)]
pub struct TrackMetadata {
    pub artist_name: String,
    pub track_name: String,
    pub release_name: Option<String>,
    pub additional_info: Option<AdditionalInfo>,
}

#[derive(Deserialize, Debug, Clone)]
pub struct ListenPayload {
    pub track_metadata: TrackMetadata,
    pub listened_at: Option<u64>,
}

#[derive(Deserialize, Debug, Clone)]
pub struct SubmitListensRequest {
    pub listen_type: String,
    pub payload: Vec<ListenPayload>,
}
