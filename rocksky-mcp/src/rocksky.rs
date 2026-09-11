//! The Rocksky AppView: who the listener is, what they play, what the platform
//! plays, and what Rocksky thinks they would like next.
//!
//! Everything here goes through [`rocksky_sdk::AppView`], whose responses are
//! typed views rather than loose JSON. The recommendation views describe tracks
//! by title/artist rather than by library id — so a set built from here is made
//! playable by running the names back through
//! [`Subsonic::best_match`](super::subsonic::Subsonic::best_match).

use anyhow::{bail, Context, Result};
use rocksky_sdk::{
    AlbumView, AppView, ArtistView, DateInterval, EqualizerPresetView, ProfileView, ScrobbleView,
    SearchResults, SongView,
};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::settings::AudioSettingsView;

/// The logged-in account.
#[derive(Clone)]
pub struct Me {
    pub did: String,
    pub handle: String,
    pub display_name: Option<String>,
}

/// A newly minted API key. The response also carries the key and its shared
/// secret; they are deliberately left out of this view, because everything a
/// tool returns lands in a model's context and the web app shows them anyway.
#[derive(Clone, Deserialize)]
pub struct ApiKeyView {
    #[serde(default)]
    pub id: Option<String>,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
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

    pub fn token(&self) -> &str {
        &self.token
    }

    /// The authenticated account. `getProfile` with no `did` answers for
    /// whoever the bearer token belongs to.
    pub async fn me(&self) -> Result<Me> {
        let profile =
            self.appview.profile("").await.map_err(|e| {
                anyhow::anyhow!("getProfile: {e} — is the access token still valid?")
            })?;
        let did = profile.did.unwrap_or_default();
        if did.is_empty() {
            bail!("getProfile returned no DID — run `rocksky login <handle>` again");
        }
        Ok(Me {
            did,
            handle: profile.handle.unwrap_or_default(),
            display_name: profile.display_name,
        })
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
        self.scrobbles(did, limit, 0).await
    }

    /// An actor's scrobbles, newest first, with paging.
    pub async fn scrobbles(&self, did: &str, limit: u32, offset: u32) -> Result<Vec<ScrobbleView>> {
        self.appview
            .scrobbles(did, limit, offset)
            .await
            .map_err(|e| anyhow::anyhow!("getActorScrobbles: {e}"))
    }

    pub async fn top_albums(&self, did: &str, limit: u32) -> Result<Vec<AlbumView>> {
        self.appview
            .albums(did, limit, 0)
            .await
            .map_err(|e| anyhow::anyhow!("getActorAlbums: {e}"))
    }

    pub async fn top_artists(&self, did: &str, limit: u32) -> Result<Vec<ArtistView>> {
        self.appview
            .artists(did, limit, 0)
            .await
            .map_err(|e| anyhow::anyhow!("getActorArtists: {e}"))
    }

    /// An actor's public profile (`app.rocksky.actor.getProfile`).
    pub async fn profile(&self, actor: &str) -> Result<ProfileView> {
        self.appview
            .profile(actor)
            .await
            .map_err(|e| anyhow::anyhow!("getProfile: {e}"))
    }

    /// An actor's aggregate counts (`app.rocksky.stats.getStats`).
    pub async fn stats(&self, actor: &str) -> Result<Value> {
        self.appview
            .stats(actor)
            .await
            .map_err(|e| anyhow::anyhow!("getStats: {e}"))
    }

    /// Platform-wide full-text search (`app.rocksky.feed.search`) — everything
    /// Rocksky has indexed, not only this listener's library.
    pub async fn search(&self, query: &str) -> Result<SearchResults> {
        self.appview
            .search(query)
            .await
            .map_err(|e| anyhow::anyhow!("search: {e}"))
    }

    /// The platform-wide top-artists chart over an interval.
    pub async fn chart_artists(
        &self,
        limit: u32,
        interval: DateInterval,
    ) -> Result<Vec<ArtistView>> {
        self.appview
            .top_artists_interval(limit, 0, interval)
            .await
            .map_err(|e| anyhow::anyhow!("getTopArtists: {e}"))
    }

    /// The platform-wide top-tracks chart over an interval.
    pub async fn chart_tracks(&self, limit: u32, interval: DateInterval) -> Result<Vec<SongView>> {
        self.appview
            .top_tracks_interval(limit, 0, interval)
            .await
            .map_err(|e| anyhow::anyhow!("getTopTracks: {e}"))
    }

    /// What an actor is scrobbling right now, from Rocksky itself and — when
    /// Rocksky has nothing — from their connected Spotify.
    pub async fn now_playing(&self, actor: &str) -> Result<Option<(Value, &'static str)>> {
        if let Ok(value) = self.appview.currently_playing(None, Some(actor)).await {
            if !is_empty(&value) {
                return Ok(Some((value, "rocksky")));
            }
        }
        match self.appview.spotify_currently_playing(actor).await {
            Ok(value) if !is_empty(&value) => Ok(Some((value, "spotify"))),
            _ => Ok(None),
        }
    }

    /// An actor's saved cross-device audio settings
    /// (`app.rocksky.rockbox.getAudioSettings`) — the record every Rocksky
    /// player starts from, or `None` when they have never saved one.
    pub async fn audio_settings(&self, did: &str) -> Result<Option<AudioSettingsView>> {
        let raw = self
            .appview
            .audio_settings(did)
            .await
            .map_err(|e| anyhow::anyhow!("getAudioSettings: {e}"))?;
        if is_empty(&raw) {
            return Ok(None);
        }
        serde_json::from_value(raw)
            .map(Some)
            .context("parsing audio settings")
    }

    /// Saved EQ presets (`app.rocksky.equalizer.listPresets`): another actor's
    /// with a `did`, the caller's own with `None`.
    pub async fn equalizer_presets(&self, did: Option<&str>) -> Result<Vec<EqualizerPresetView>> {
        self.appview
            .equalizer_presets(did)
            .await
            .map_err(|e| anyhow::anyhow!("listPresets: {e}"))
    }

    /// Mint an API key for the logged-in account — the credential third-party
    /// scrobblers authenticate with.
    ///
    /// This is the one call that does not go through the AppView: the
    /// `app.rocksky.apikey.createApikey` procedure is still a stub server-side,
    /// so keys are minted over `POST /apikeys`, the same route the web app and
    /// the CLI use.
    pub async fn create_api_key(
        &self,
        name: &str,
        description: Option<&str>,
    ) -> Result<ApiKeyView> {
        let res = self
            .http
            .post(format!("{}/apikeys", self.api_url))
            .bearer_auth(&self.token)
            .json(&json!({ "name": name, "description": description.unwrap_or_default() }))
            .send()
            .await
            .context("creating API key")?;
        if !res.status().is_success() {
            bail!("creating an API key returned HTTP {}", res.status());
        }
        res.json().await.context("parsing the created API key")
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

/// A scrobble with when it happened and where it lives — for the history
/// tools, where "the same song twice" is the point rather than noise.
pub fn scrobble_detail_json(scrobble: &ScrobbleView) -> Value {
    let mut v = scrobble_view_json(scrobble);
    if let Some(at) = &scrobble.created_at {
        v["playedAt"] = json!(at);
    }
    if let Some(uri) = &scrobble.track_uri {
        v["link"] = json!(web_link(uri));
    }
    v
}

pub fn album_view_json(album: &AlbumView) -> Value {
    let mut v = json!({
        "title": album.title.clone().unwrap_or_default(),
        "artist": album.artist.clone().unwrap_or_default(),
    });
    if let Some(year) = album.year {
        v["year"] = json!(year);
    }
    if let Some(count) = album.play_count {
        v["playCount"] = json!(count);
    }
    if let Some(uri) = &album.uri {
        v["link"] = json!(web_link(uri));
    }
    v
}

pub fn artist_view_json(artist: &ArtistView) -> Value {
    let mut v = json!({ "name": artist.name.clone().unwrap_or_default() });
    if !artist.genres.is_empty() {
        v["genres"] = json!(artist.genres);
    }
    if let Some(count) = artist.play_count {
        v["playCount"] = json!(count);
    }
    if let Some(listeners) = artist.unique_listeners {
        v["listeners"] = json!(listeners);
    }
    if let Some(uri) = &artist.uri {
        v["link"] = json!(web_link(uri));
    }
    v
}

pub fn profile_json(profile: &ProfileView) -> Value {
    let handle = profile.handle.clone().unwrap_or_default();
    let mut v = json!({
        "did": profile.did.clone().unwrap_or_default(),
        "handle": handle,
    });
    if let Some(name) = &profile.display_name {
        v["displayName"] = json!(name);
    }
    if let Some(avatar) = &profile.avatar {
        v["avatar"] = json!(avatar);
    }
    if let Some(handle) = &profile.handle {
        v["profile"] = json!(format!("https://rocksky.app/profile/{handle}"));
    }
    v
}

/// The rocksky.app page for an `at://` record URI.
pub fn web_link(uri: &str) -> String {
    match uri.strip_prefix("at://") {
        Some(rest) => format!("https://rocksky.app/{rest}"),
        None => uri.to_string(),
    }
}

/// `"all"` (the default), or a rolling window: `7d`, `4w`, `6m`, `1y`.
pub fn parse_interval(spec: Option<&str>) -> Result<DateInterval> {
    let Some(spec) = spec.map(str::trim).filter(|s| !s.is_empty()) else {
        return Ok(DateInterval::AllTime);
    };
    if spec.eq_ignore_ascii_case("all") || spec.eq_ignore_ascii_case("alltime") {
        return Ok(DateInterval::AllTime);
    }
    let (count, unit) = spec.split_at(spec.len() - 1);
    let n: u32 = count.parse().with_context(|| {
        format!("invalid interval {spec:?}: expected \"all\", or 7d / 4w / 6m / 1y")
    })?;
    match unit {
        "d" | "D" => Ok(DateInterval::LastDays(n)),
        "w" | "W" => Ok(DateInterval::LastWeeks(n)),
        "m" | "M" => Ok(DateInterval::LastMonths(n)),
        "y" | "Y" => Ok(DateInterval::LastYears(n)),
        _ => bail!("invalid interval {spec:?}: expected \"all\", or 7d / 4w / 6m / 1y"),
    }
}

/// An empty JSON document — `{}`, `null`, or `[]`. The AppView answers a
/// now-playing query with an empty object when there is nothing playing.
fn is_empty(value: &Value) -> bool {
    match value {
        Value::Null => true,
        Value::Object(map) => map.is_empty(),
        Value::Array(items) => items.is_empty(),
        _ => false,
    }
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
