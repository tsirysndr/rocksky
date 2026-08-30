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

/// One recommended artist, shaped exactly like
/// `app.rocksky.feed.defs#recommendedArtistView`.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecommendedArtist {
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub uri: Option<String>,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub picture: Option<String>,
    pub genres: Vec<String>,
    pub recommendation_score: f64,
    /// "neighbour" | "serendipity" | "chart"
    pub source: String,
}

#[derive(Serialize)]
pub struct RecommendedArtistsResponse {
    pub artists: Vec<RecommendedArtist>,
}

/// One recommended album, shaped exactly like
/// `app.rocksky.feed.defs#recommendedAlbumView`.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecommendedAlbum {
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub uri: Option<String>,
    pub title: String,
    pub artist: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub artist_uri: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub year: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub album_art: Option<String>,
    pub recommendation_score: f64,
    /// "known-artist" | "new-artist" | "chart"
    pub source: String,
}

#[derive(Serialize)]
pub struct RecommendedAlbumsResponse {
    pub albums: Vec<RecommendedAlbum>,
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
