use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct WebhookEnvelope {
    #[serde(default)]
    pub r#type: String,
    pub id: String,
    #[serde(default)]
    pub delivered_at: Option<String>,
    pub data: ScrobbleData,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct ScrobbleData {
    pub user: User,
    pub track: Track,
    pub played_at: String, // ISO 8601
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct User {
    pub did: String,
    pub display_name: String,
    pub handle: String,
    pub avatar_url: String,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct Track {
    pub title: String,
    pub artist: String,
    pub album: String,
    pub duration: i32,
    #[serde(default)]
    pub artwork_url: Option<String>,
    #[serde(default)]
    pub spotify_url: Option<String>,
    #[serde(default)]
    pub tidal_url: Option<String>,
    #[serde(default)]
    pub youtube_url: Option<String>,
}

/* ---------- Discord payloads ---------- */

#[derive(Debug, Serialize)]
pub struct DiscordWebhookPayload {
    #[serde(default)]
    pub content: String,
    #[serde(default)]
    pub embeds: Vec<DiscordEmbed>,
}

#[derive(Debug, Serialize)]
pub struct DiscordEmbed {
    pub title: String,
    pub url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timestamp: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thumbnail: Option<DiscordThumb>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub footer: Option<DiscordFooter>,
    pub author: DiscordAuthor,
}

#[derive(Debug, Serialize)]
pub struct DiscordAuthor {
    pub name: String,
    pub url: String,
    pub icon_url: String,
}

#[derive(Debug, Serialize)]
pub struct DiscordThumb {
    pub url: String,
}

#[derive(Debug, Serialize)]
pub struct DiscordFooter {
    pub text: String,
}
