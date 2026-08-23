use serde::Serialize;

/// One recommended track, shaped exactly like
/// `app.rocksky.feed.defs#recommendationView` so `apps/api` can return drift's
/// body verbatim.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Recommendation {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub artist: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub album: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub album_art: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub track_uri: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub artist_uri: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub album_uri: Option<String>,
    pub genres: Vec<String>,
    pub recommendation_score: f64,
    /// "neighbour" | "social" | "serendipity" | "chart"
    pub source: String,
    pub likes_count: i64,
}

#[derive(Serialize)]
pub struct RecommendationsResponse {
    pub recommendations: Vec<Recommendation>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatusResponse {
    pub refreshed_at: Option<u64>,
    pub refresh_took_ms: Option<u128>,
    pub users: usize,
    pub rows: usize,
    pub refresh_interval_secs: u64,
}
