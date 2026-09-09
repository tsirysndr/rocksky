//! Taste: who the listener is, what they play, and what Rocksky thinks they
//! would like next.
//!
//! The AppView answers all three, but its recommendation views describe tracks
//! by title/artist rather than by library id — so a set built from here is
//! made playable by running the names back through
//! [`Subsonic::best_match`](super::subsonic::Subsonic::best_match).

use anyhow::{bail, Context, Result};
use rocksky_sdk::{AppView, ScrobbleView, SongView};
use serde::Deserialize;
use serde_json::{json, Value};

/// The logged-in account.
#[derive(Clone, Deserialize)]
pub struct Me {
    pub did: String,
    #[serde(default)]
    pub handle: String,
    #[serde(default, rename = "displayName")]
    pub display_name: Option<String>,
}

/// `app.rocksky.feed.defs#recommendationView`.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackRecommendation {
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub artist: String,
    #[serde(default)]
    pub album: String,
    #[serde(default)]
    pub genres: Vec<String>,
    /// The lexicon types this as an integer, but the recommender returns a
    /// fractional score — parse what is actually on the wire.
    #[serde(default)]
    pub recommendation_score: Option<f64>,
    #[serde(default)]
    pub source: Option<String>,
}

/// `app.rocksky.feed.defs#recommendedArtistView`.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtistRecommendation {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub genres: Vec<String>,
    /// The lexicon types this as an integer, but the recommender returns a
    /// fractional score — parse what is actually on the wire.
    #[serde(default)]
    pub recommendation_score: Option<f64>,
    #[serde(default)]
    pub source: Option<String>,
}

/// `app.rocksky.feed.defs#recommendedAlbumView`.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlbumRecommendation {
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub artist: String,
    #[serde(default)]
    pub year: Option<i64>,
    /// The lexicon types this as an integer, but the recommender returns a
    /// fractional score — parse what is actually on the wire.
    #[serde(default)]
    pub recommendation_score: Option<f64>,
    #[serde(default)]
    pub source: Option<String>,
}

pub struct Rocksky {
    appview: AppView,
    http: reqwest::Client,
    api_url: String,
    token: String,
}

impl Rocksky {
    pub fn new(api_url: &str, token: String) -> Rocksky {
        let api_url = api_url.trim_end_matches('/').to_string();
        Rocksky {
            appview: AppView::new(api_url.clone()).with_token(token.clone()),
            http: reqwest::Client::new(),
            api_url,
            token,
        }
    }

    pub fn http(&self) -> &reqwest::Client {
        &self.http
    }

    pub fn api_url(&self) -> &str {
        &self.api_url
    }

    pub fn token(&self) -> &str {
        &self.token
    }

    pub async fn me(&self) -> Result<Me> {
        let res = self
            .http
            .get(format!(
                "{}/xrpc/app.rocksky.actor.getProfile",
                self.api_url
            ))
            .bearer_auth(&self.token)
            .send()
            .await
            .context("fetching own profile")?;
        if !res.status().is_success() {
            bail!(
                "getProfile returned HTTP {} — is the access token still valid?",
                res.status()
            );
        }
        res.json::<Me>().await.context("parsing own profile")
    }

    /// The listener's own most-played songs.
    pub async fn top_songs(&self, did: &str, limit: u32) -> Result<Vec<SongView>> {
        self.appview
            .songs(did, limit, 0)
            .await
            .map_err(|e| anyhow::anyhow!("getActorSongs: {e}"))
    }

    pub async fn loved_songs(&self, did: &str, limit: u32) -> Result<Vec<SongView>> {
        self.appview
            .loved_songs(did, limit, 0)
            .await
            .map_err(|e| anyhow::anyhow!("getActorLovedSongs: {e}"))
    }

    pub async fn recent_scrobbles(&self, did: &str, limit: u32) -> Result<Vec<ScrobbleView>> {
        self.appview
            .scrobbles(did, limit, 0)
            .await
            .map_err(|e| anyhow::anyhow!("getActorScrobbles: {e}"))
    }

    pub async fn track_recommendations(
        &self,
        did: &str,
        limit: u32,
    ) -> Result<Vec<TrackRecommendation>> {
        let out = self
            .appview
            .recommendations(did, Some(limit))
            .await
            .map_err(|e| anyhow::anyhow!("getRecommendations: {e}"))?;
        parse_list(out, "recommendations")
    }

    pub async fn artist_recommendations(
        &self,
        did: &str,
        limit: u32,
    ) -> Result<Vec<ArtistRecommendation>> {
        let out = self
            .appview
            .artist_recommendations(did, Some(limit))
            .await
            .map_err(|e| anyhow::anyhow!("getArtistRecommendations: {e}"))?;
        parse_list(out, "artists")
    }

    pub async fn album_recommendations(
        &self,
        did: &str,
        limit: u32,
    ) -> Result<Vec<AlbumRecommendation>> {
        let out = self
            .appview
            .album_recommendations(did, Some(limit))
            .await
            .map_err(|e| anyhow::anyhow!("getAlbumRecommendations: {e}"))?;
        parse_list(out, "albums")
    }
}

fn parse_list<T: serde::de::DeserializeOwned>(value: Value, key: &str) -> Result<Vec<T>> {
    let items = value.get(key).cloned().unwrap_or(Value::Array(Vec::new()));
    serde_json::from_value(items).with_context(|| format!("parsing {key}"))
}

pub fn song_view_json(song: &SongView) -> Value {
    let mut v = json!({
        "title": song.title.clone().unwrap_or_default(),
        "artist": song.artist.clone().unwrap_or_default(),
        "album": song.album.clone().unwrap_or_default(),
    });
    if let Some(count) = song.play_count {
        v["playCount"] = json!(count);
    }
    if let Some(duration) = song.duration {
        v["durationMs"] = json!(duration);
    }
    v
}

pub fn scrobble_view_json(scrobble: &ScrobbleView) -> Value {
    json!({
        "title": scrobble.title.clone().unwrap_or_default(),
        "artist": scrobble.artist.clone().unwrap_or_default(),
        "album": scrobble.album.clone().unwrap_or_default(),
    })
}

pub fn track_recommendation_json(rec: &TrackRecommendation) -> Value {
    let mut v = json!({ "title": rec.title, "artist": rec.artist, "album": rec.album });
    if !rec.genres.is_empty() {
        v["genres"] = json!(rec.genres);
    }
    if let Some(score) = rec.recommendation_score {
        v["score"] = json!((score * 1000.0).round() / 1000.0);
    }
    if let Some(source) = &rec.source {
        v["source"] = json!(source);
    }
    v
}

pub fn artist_recommendation_json(rec: &ArtistRecommendation) -> Value {
    let mut v = json!({ "artist": rec.name });
    if !rec.genres.is_empty() {
        v["genres"] = json!(rec.genres);
    }
    if let Some(score) = rec.recommendation_score {
        v["score"] = json!((score * 1000.0).round() / 1000.0);
    }
    if let Some(source) = &rec.source {
        v["source"] = json!(source);
    }
    v
}

pub fn album_recommendation_json(rec: &AlbumRecommendation) -> Value {
    let mut v = json!({ "title": rec.title, "artist": rec.artist });
    if let Some(year) = rec.year {
        v["year"] = json!(year);
    }
    if let Some(score) = rec.recommendation_score {
        v["score"] = json!((score * 1000.0).round() / 1000.0);
    }
    if let Some(source) = &rec.source {
        v["source"] = json!(source);
    }
    v
}
