//! The read side of the SDK: a thin async client over the public Rocksky AppView
//! XRPC (`app.rocksky.*`). Everything here is unauthenticated JSON-over-HTTP, so
//! [`AppView`] is usable standalone — a discovery bot needs nothing else.
//!
//! The wire types (below) are hand-written to match the AppView's JSON view defs
//! (`apps/api/lexicons/**/defs.json`), not the generated record types.

use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};

use crate::error::{Result, SdkError};

/// A thin async client over the public Rocksky AppView XRPC.
#[derive(Clone)]
pub struct AppView {
    http: reqwest::Client,
    base: String,
}

impl AppView {
    /// Build a client against an AppView base URL (e.g. `https://api.rocksky.app`).
    pub fn new(base: impl Into<String>) -> Self {
        let http = reqwest::Client::builder()
            .user_agent(concat!("rocksky-sdk/", env!("CARGO_PKG_VERSION")))
            .build()
            .expect("reqwest client");
        Self {
            http,
            base: base.into().trim_end_matches('/').to_string(),
        }
    }

    async fn query<T: DeserializeOwned>(&self, nsid: &str, params: &[(&str, String)]) -> Result<T> {
        let url = format!("{}/xrpc/{}", self.base, nsid);
        let filtered: Vec<(&str, String)> = params
            .iter()
            .filter(|(_, v)| !v.is_empty())
            .cloned()
            .collect();
        let res = self.http.get(&url).query(&filtered).send().await?;
        let status = res.status();
        let body = res.text().await.unwrap_or_default();
        if !status.is_success() {
            return Err(SdkError::AppView {
                nsid: nsid.to_string(),
                status: status.as_u16(),
                body,
            });
        }
        serde_json::from_str(&body)
            .map_err(|e| SdkError::Other(format!("decode {nsid}: {e}: {body}")))
    }

    /// An actor's detailed profile (`app.rocksky.actor.getProfile`). `actor` is a
    /// handle or DID.
    pub async fn profile(&self, actor: &str) -> Result<ProfileView> {
        self.query(
            "app.rocksky.actor.getProfile",
            &[("did", actor.to_string())],
        )
        .await
    }

    /// An actor's scrobbles, newest first (`app.rocksky.actor.getActorScrobbles`).
    pub async fn scrobbles(
        &self,
        actor: &str,
        limit: u32,
        offset: u32,
    ) -> Result<Vec<ScrobbleView>> {
        let out: ScrobblesOutput = self
            .query(
                "app.rocksky.actor.getActorScrobbles",
                &[
                    ("did", actor.to_string()),
                    ("limit", limit.to_string()),
                    ("offset", offset.to_string()),
                ],
            )
            .await?;
        Ok(out.scrobbles)
    }

    /// An actor's most-played songs (`app.rocksky.actor.getActorSongs`).
    pub async fn songs(&self, actor: &str, limit: u32, offset: u32) -> Result<Vec<SongView>> {
        let out: SongsOutput = self
            .query(
                "app.rocksky.actor.getActorSongs",
                &[
                    ("did", actor.to_string()),
                    ("limit", limit.to_string()),
                    ("offset", offset.to_string()),
                ],
            )
            .await?;
        Ok(out.songs)
    }

    /// An actor's most-played albums (`app.rocksky.actor.getActorAlbums`).
    pub async fn albums(&self, actor: &str, limit: u32, offset: u32) -> Result<Vec<AlbumView>> {
        let out: AlbumsOutput = self
            .query(
                "app.rocksky.actor.getActorAlbums",
                &[
                    ("did", actor.to_string()),
                    ("limit", limit.to_string()),
                    ("offset", offset.to_string()),
                ],
            )
            .await?;
        Ok(out.albums)
    }

    /// An actor's most-played artists (`app.rocksky.actor.getActorArtists`).
    pub async fn artists(&self, actor: &str, limit: u32, offset: u32) -> Result<Vec<ArtistView>> {
        let out: ArtistsOutput = self
            .query(
                "app.rocksky.actor.getActorArtists",
                &[
                    ("did", actor.to_string()),
                    ("limit", limit.to_string()),
                    ("offset", offset.to_string()),
                ],
            )
            .await?;
        Ok(out.artists)
    }

    /// A feed by its at:// URI (`app.rocksky.feed.getFeed`). Paginated via
    /// `cursor` (pass `None` for the first page).
    pub async fn feed(&self, feed: &str, limit: u32, cursor: Option<&str>) -> Result<FeedView> {
        self.query(
            "app.rocksky.feed.getFeed",
            &[
                ("feed", feed.to_string()),
                ("limit", limit.to_string()),
                ("cursor", cursor.unwrap_or_default().to_string()),
            ],
        )
        .await
    }

    /// Full-text search across songs, albums, artists, playlists and actors
    /// (`app.rocksky.feed.search`). Hits are a heterogeneous union, kept as raw
    /// JSON values.
    pub async fn search(&self, query: &str) -> Result<SearchResults> {
        self.query("app.rocksky.feed.search", &[("query", query.to_string())])
            .await
    }

    /// The platform-wide top artists chart (`app.rocksky.charts.getTopArtists`).
    pub async fn top_artists(&self, limit: u32, offset: u32) -> Result<Vec<ArtistView>> {
        let out: ArtistsOutput = self
            .query(
                "app.rocksky.charts.getTopArtists",
                &[("limit", limit.to_string()), ("offset", offset.to_string())],
            )
            .await?;
        Ok(out.artists)
    }

    /// The platform-wide top tracks chart (`app.rocksky.charts.getTopTracks`).
    pub async fn top_tracks(&self, limit: u32, offset: u32) -> Result<Vec<SongView>> {
        let out: TracksOutput = self
            .query(
                "app.rocksky.charts.getTopTracks",
                &[("limit", limit.to_string()), ("offset", offset.to_string())],
            )
            .await?;
        Ok(out.tracks)
    }

    /// Platform-wide totals (`app.rocksky.stats.getGlobalStats`).
    pub async fn global_stats(&self) -> Result<GlobalStats> {
        self.query("app.rocksky.stats.getGlobalStats", &[]).await
    }
}

// ---- wire types ----------------------------------------------------------

/// `app.rocksky.actor.defs#profileViewDetailed`.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileView {
    #[serde(default)]
    pub id: Option<String>,
    #[serde(default)]
    pub did: Option<String>,
    #[serde(default)]
    pub handle: Option<String>,
    #[serde(default)]
    pub display_name: Option<String>,
    #[serde(default)]
    pub avatar: Option<String>,
    #[serde(default)]
    pub created_at: Option<String>,
    #[serde(default)]
    pub updated_at: Option<String>,
}

/// A scrobble as returned by the AppView (`app.rocksky.scrobble.defs#scrobbleViewBasic`).
///
/// Field names track the live AppView JSON, which differs slightly from the
/// lexicon def: the actor is carried as `handle`/`avatar`/`did` (rather than
/// `user`/`userAvatar`), the album cover as `album_art`, and the timestamp as
/// `created_at`. Every field is optional so both basic and detailed responses
/// decode.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScrobbleView {
    #[serde(default)]
    pub id: Option<String>,
    #[serde(default)]
    pub track_id: Option<String>,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub artist: Option<String>,
    #[serde(default)]
    pub album_artist: Option<String>,
    #[serde(default)]
    pub album: Option<String>,
    #[serde(default)]
    pub album_art: Option<String>,
    /// The scrobbling actor's handle.
    #[serde(default)]
    pub handle: Option<String>,
    #[serde(default)]
    pub did: Option<String>,
    /// The scrobbling actor's avatar URL.
    #[serde(default)]
    pub avatar: Option<String>,
    #[serde(default)]
    pub uri: Option<String>,
    #[serde(default)]
    pub track_uri: Option<String>,
    #[serde(default)]
    pub artist_uri: Option<String>,
    #[serde(default)]
    pub album_uri: Option<String>,
    #[serde(default)]
    pub created_at: Option<String>,
    // Fields that appear on detailed / social responses.
    #[serde(default)]
    pub sha256: Option<String>,
    #[serde(default)]
    pub liked: Option<bool>,
    #[serde(default)]
    pub likes_count: Option<u32>,
}

/// `app.rocksky.song.defs#songViewBasic`.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SongView {
    #[serde(default)]
    pub id: Option<String>,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub artist: Option<String>,
    #[serde(default)]
    pub album_artist: Option<String>,
    #[serde(default)]
    pub album_art: Option<String>,
    #[serde(default)]
    pub uri: Option<String>,
    #[serde(default)]
    pub album: Option<String>,
    #[serde(default)]
    pub duration: Option<u64>,
    #[serde(default)]
    pub track_number: Option<u32>,
    #[serde(default)]
    pub disc_number: Option<u32>,
    #[serde(default)]
    pub play_count: Option<u64>,
    #[serde(default)]
    pub unique_listeners: Option<u64>,
    #[serde(default)]
    pub album_uri: Option<String>,
    #[serde(default)]
    pub artist_uri: Option<String>,
    #[serde(default)]
    pub sha256: Option<String>,
    #[serde(default)]
    pub mbid: Option<String>,
    #[serde(default)]
    pub isrc: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub created_at: Option<String>,
}

/// `app.rocksky.album.defs#albumViewBasic`.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlbumView {
    #[serde(default)]
    pub id: Option<String>,
    #[serde(default)]
    pub uri: Option<String>,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub artist: Option<String>,
    #[serde(default)]
    pub artist_uri: Option<String>,
    #[serde(default)]
    pub year: Option<u32>,
    #[serde(default)]
    pub album_art: Option<String>,
    #[serde(default)]
    pub release_date: Option<String>,
    #[serde(default)]
    pub sha256: Option<String>,
    #[serde(default)]
    pub play_count: Option<u64>,
    #[serde(default)]
    pub unique_listeners: Option<u64>,
}

/// `app.rocksky.artist.defs#artistViewBasic`.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtistView {
    #[serde(default)]
    pub id: Option<String>,
    #[serde(default)]
    pub uri: Option<String>,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub picture: Option<String>,
    #[serde(default)]
    pub sha256: Option<String>,
    #[serde(default)]
    pub play_count: Option<u64>,
    #[serde(default)]
    pub unique_listeners: Option<u64>,
    #[serde(default)]
    pub tags: Vec<String>,
}

/// `app.rocksky.feed.defs#feedView`.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FeedView {
    #[serde(default)]
    pub feed: Vec<FeedItem>,
    #[serde(default)]
    pub cursor: Option<String>,
}

/// `app.rocksky.feed.defs#feedItemView`.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FeedItem {
    #[serde(default)]
    pub scrobble: Option<ScrobbleView>,
}

/// `app.rocksky.feed.defs#searchResultsView`. Hits are a union of song / album /
/// artist / playlist / actor views, kept as raw JSON.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResults {
    #[serde(default)]
    pub hits: Vec<serde_json::Value>,
    #[serde(default)]
    pub processing_time_ms: Option<u64>,
    #[serde(default)]
    pub limit: Option<u32>,
    #[serde(default)]
    pub offset: Option<u32>,
    #[serde(default)]
    pub estimated_total_hits: Option<u64>,
}

/// `app.rocksky.stats.defs#globalStatsView`.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GlobalStats {
    #[serde(default)]
    pub scrobbles: u64,
    #[serde(default)]
    pub users: u64,
    #[serde(default)]
    pub artists: u64,
    #[serde(default)]
    pub albums: u64,
    #[serde(default)]
    pub tracks: u64,
}

// ---- output envelopes ----------------------------------------------------

#[derive(Deserialize)]
struct ScrobblesOutput {
    #[serde(default)]
    scrobbles: Vec<ScrobbleView>,
}

#[derive(Deserialize)]
struct SongsOutput {
    #[serde(default)]
    songs: Vec<SongView>,
}

#[derive(Deserialize)]
struct AlbumsOutput {
    #[serde(default)]
    albums: Vec<AlbumView>,
}

#[derive(Deserialize)]
struct ArtistsOutput {
    #[serde(default)]
    artists: Vec<ArtistView>,
}

#[derive(Deserialize)]
struct TracksOutput {
    #[serde(default)]
    tracks: Vec<SongView>,
}
