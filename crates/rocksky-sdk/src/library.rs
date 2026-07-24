//! Ergonomic wrappers for the authenticated `app.rocksky.library.*` API — the
//! Subsonic/navidrome-compatible surface over a user's uploaded music.
//!
//! Every method here requires a valid access token, so [`Library`] can only be
//! built *with* one ([`Library::new`] rejects an empty token, and
//! [`crate::AppView::library`] errors when the client has none). Both the GET
//! and POST helpers always send `Authorization: Bearer <token>`.
//!
//! Outputs are the raw JSON payloads returned by the AppView (the library
//! lexicons are intentionally loose), so each method returns [`serde_json::Value`].

use serde::de::DeserializeOwned;
use serde_json::Value;

use crate::error::{Result, SdkError};

/// Authenticated client for `app.rocksky.library.*`. Construct via
/// [`Library::new`] or [`crate::AppView::library`]; a non-empty token is
/// mandatory.
#[derive(Clone)]
pub struct Library {
    http: reqwest::Client,
    base: String,
    token: String,
}

impl Library {
    /// Build a library client against an AppView base URL with the required
    /// bearer access token. Returns [`SdkError::Auth`] if `token` is empty.
    pub fn new(base: impl Into<String>, token: impl Into<String>) -> Result<Self> {
        let token = token.into();
        if token.trim().is_empty() {
            return Err(SdkError::Auth(
                "app.rocksky.library.* requires a non-empty access token".into(),
            ));
        }
        let http = reqwest::Client::builder()
            .user_agent(concat!("rocksky-sdk/", env!("CARGO_PKG_VERSION")))
            .build()
            .expect("reqwest client");
        Ok(Self {
            http,
            base: base.into().trim_end_matches('/').to_string(),
            token,
        })
    }

    async fn decode<T: DeserializeOwned>(&self, nsid: &str, res: reqwest::Response) -> Result<T> {
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

    /// GET an authenticated library query. Empty-valued params are dropped.
    async fn query(&self, nsid: &str, params: Vec<(&str, String)>) -> Result<Value> {
        let url = format!("{}/xrpc/{}", self.base, nsid);
        let filtered: Vec<(&str, String)> =
            params.into_iter().filter(|(_, v)| !v.is_empty()).collect();
        let res = self
            .http
            .get(&url)
            .query(&filtered)
            .bearer_auth(&self.token)
            .send()
            .await?;
        self.decode(nsid, res).await
    }

    /// POST an authenticated library procedure with a JSON body.
    async fn procedure(&self, nsid: &str, body: Value) -> Result<Value> {
        let url = format!("{}/xrpc/{}", self.base, nsid);
        let res = self
            .http
            .post(&url)
            .json(&body)
            .bearer_auth(&self.token)
            .send()
            .await?;
        self.decode(nsid, res).await
    }

    /// Query `app.rocksky.library.ping` (auth required).
    pub async fn ping(&self) -> Result<Value> {
        self.query("app.rocksky.library.ping", Vec::new()).await
    }

    /// Query `app.rocksky.library.getLicense` (auth required).
    pub async fn get_license(&self) -> Result<Value> {
        self.query("app.rocksky.library.getLicense", Vec::new())
            .await
    }

    /// Query `app.rocksky.library.getMusicFolders` (auth required).
    pub async fn get_music_folders(&self) -> Result<Value> {
        self.query("app.rocksky.library.getMusicFolders", Vec::new())
            .await
    }

    /// Query `app.rocksky.library.getScanStatus` (auth required).
    pub async fn get_scan_status(&self) -> Result<Value> {
        self.query("app.rocksky.library.getScanStatus", Vec::new())
            .await
    }

    /// Query `app.rocksky.library.startScan` (auth required).
    pub async fn start_scan(&self) -> Result<Value> {
        self.query("app.rocksky.library.startScan", Vec::new())
            .await
    }

    /// Query `app.rocksky.library.getUser` (auth required).
    pub async fn get_user(&self) -> Result<Value> {
        self.query("app.rocksky.library.getUser", Vec::new()).await
    }

    /// Query `app.rocksky.library.getArtists` (auth required).
    pub async fn get_artists(&self) -> Result<Value> {
        self.query("app.rocksky.library.getArtists", Vec::new())
            .await
    }

    /// Query `app.rocksky.library.getIndexes` (auth required).
    pub async fn get_indexes(&self) -> Result<Value> {
        self.query("app.rocksky.library.getIndexes", Vec::new())
            .await
    }

    /// Query `app.rocksky.library.getArtist` (auth required).
    pub async fn get_artist(&self, id: &str) -> Result<Value> {
        let mut params: Vec<(&str, String)> = Vec::new();
        params.push(("id", id.to_string()));
        self.query("app.rocksky.library.getArtist", params).await
    }

    /// Query `app.rocksky.library.getArtistInfo` (auth required).
    pub async fn get_artist_info(&self, id: &str) -> Result<Value> {
        let mut params: Vec<(&str, String)> = Vec::new();
        params.push(("id", id.to_string()));
        self.query("app.rocksky.library.getArtistInfo", params)
            .await
    }

    /// Query `app.rocksky.library.getAlbum` (auth required).
    pub async fn get_album(&self, id: &str) -> Result<Value> {
        let mut params: Vec<(&str, String)> = Vec::new();
        params.push(("id", id.to_string()));
        self.query("app.rocksky.library.getAlbum", params).await
    }

    /// Query `app.rocksky.library.getAlbumList` (auth required).
    pub async fn get_album_list(
        &self,
        r#type: &str,
        size: Option<i64>,
        offset: Option<i64>,
        from_year: Option<i64>,
        to_year: Option<i64>,
        genre: Option<&str>,
    ) -> Result<Value> {
        let mut params: Vec<(&str, String)> = Vec::new();
        params.push(("type", r#type.to_string()));
        if let Some(v) = size {
            params.push(("size", v.to_string()));
        }
        if let Some(v) = offset {
            params.push(("offset", v.to_string()));
        }
        if let Some(v) = from_year {
            params.push(("fromYear", v.to_string()));
        }
        if let Some(v) = to_year {
            params.push(("toYear", v.to_string()));
        }
        if let Some(v) = genre {
            params.push(("genre", v.to_string()));
        }
        self.query("app.rocksky.library.getAlbumList", params).await
    }

    /// Query `app.rocksky.library.getAlbumInfo` (auth required).
    pub async fn get_album_info(&self, id: &str) -> Result<Value> {
        let mut params: Vec<(&str, String)> = Vec::new();
        params.push(("id", id.to_string()));
        self.query("app.rocksky.library.getAlbumInfo", params).await
    }

    /// Query `app.rocksky.library.getSong` (auth required).
    pub async fn get_song(&self, id: &str) -> Result<Value> {
        let mut params: Vec<(&str, String)> = Vec::new();
        params.push(("id", id.to_string()));
        self.query("app.rocksky.library.getSong", params).await
    }

    /// Query `app.rocksky.library.getRandomSongs` (auth required).
    pub async fn get_random_songs(
        &self,
        size: Option<i64>,
        genre: Option<&str>,
        from_year: Option<i64>,
        to_year: Option<i64>,
    ) -> Result<Value> {
        let mut params: Vec<(&str, String)> = Vec::new();
        if let Some(v) = size {
            params.push(("size", v.to_string()));
        }
        if let Some(v) = genre {
            params.push(("genre", v.to_string()));
        }
        if let Some(v) = from_year {
            params.push(("fromYear", v.to_string()));
        }
        if let Some(v) = to_year {
            params.push(("toYear", v.to_string()));
        }
        self.query("app.rocksky.library.getRandomSongs", params)
            .await
    }

    /// Query `app.rocksky.library.getSongsByGenre` (auth required).
    pub async fn get_songs_by_genre(
        &self,
        genre: &str,
        count: Option<i64>,
        offset: Option<i64>,
    ) -> Result<Value> {
        let mut params: Vec<(&str, String)> = Vec::new();
        params.push(("genre", genre.to_string()));
        if let Some(v) = count {
            params.push(("count", v.to_string()));
        }
        if let Some(v) = offset {
            params.push(("offset", v.to_string()));
        }
        self.query("app.rocksky.library.getSongsByGenre", params)
            .await
    }

    /// Query `app.rocksky.library.getSimilarSongs` (auth required).
    pub async fn get_similar_songs(&self, id: &str, count: Option<i64>) -> Result<Value> {
        let mut params: Vec<(&str, String)> = Vec::new();
        params.push(("id", id.to_string()));
        if let Some(v) = count {
            params.push(("count", v.to_string()));
        }
        self.query("app.rocksky.library.getSimilarSongs", params)
            .await
    }

    /// Query `app.rocksky.library.getTopSongs` (auth required).
    pub async fn get_top_songs(&self, artist: &str, count: Option<i64>) -> Result<Value> {
        let mut params: Vec<(&str, String)> = Vec::new();
        params.push(("artist", artist.to_string()));
        if let Some(v) = count {
            params.push(("count", v.to_string()));
        }
        self.query("app.rocksky.library.getTopSongs", params).await
    }

    /// Query `app.rocksky.library.getLyrics` (auth required).
    pub async fn get_lyrics(&self, artist: Option<&str>, title: Option<&str>) -> Result<Value> {
        let mut params: Vec<(&str, String)> = Vec::new();
        if let Some(v) = artist {
            params.push(("artist", v.to_string()));
        }
        if let Some(v) = title {
            params.push(("title", v.to_string()));
        }
        self.query("app.rocksky.library.getLyrics", params).await
    }

    /// Query `app.rocksky.library.getMusicDirectory` (auth required).
    pub async fn get_music_directory(&self, id: &str) -> Result<Value> {
        let mut params: Vec<(&str, String)> = Vec::new();
        params.push(("id", id.to_string()));
        self.query("app.rocksky.library.getMusicDirectory", params)
            .await
    }

    /// Query `app.rocksky.library.getGenres` (auth required).
    pub async fn get_genres(&self) -> Result<Value> {
        self.query("app.rocksky.library.getGenres", Vec::new())
            .await
    }

    /// Query `app.rocksky.library.search` (auth required).
    pub async fn search(
        &self,
        query: &str,
        artist_count: Option<i64>,
        artist_offset: Option<i64>,
        album_count: Option<i64>,
        album_offset: Option<i64>,
        song_count: Option<i64>,
        song_offset: Option<i64>,
    ) -> Result<Value> {
        let mut params: Vec<(&str, String)> = Vec::new();
        params.push(("query", query.to_string()));
        if let Some(v) = artist_count {
            params.push(("artistCount", v.to_string()));
        }
        if let Some(v) = artist_offset {
            params.push(("artistOffset", v.to_string()));
        }
        if let Some(v) = album_count {
            params.push(("albumCount", v.to_string()));
        }
        if let Some(v) = album_offset {
            params.push(("albumOffset", v.to_string()));
        }
        if let Some(v) = song_count {
            params.push(("songCount", v.to_string()));
        }
        if let Some(v) = song_offset {
            params.push(("songOffset", v.to_string()));
        }
        self.query("app.rocksky.library.search", params).await
    }

    /// Query `app.rocksky.library.getStarred` (auth required).
    pub async fn get_starred(&self) -> Result<Value> {
        self.query("app.rocksky.library.getStarred", Vec::new())
            .await
    }

    /// Call the procedure `app.rocksky.library.star` (auth required).
    pub async fn star(
        &self,
        id: &str,
        album_id: Option<&str>,
        artist_id: Option<&str>,
    ) -> Result<Value> {
        let mut body = serde_json::Map::new();
        body.insert("id".into(), Value::String(id.to_string()));
        if let Some(v) = album_id {
            body.insert("albumId".into(), Value::String(v.to_string()));
        }
        if let Some(v) = artist_id {
            body.insert("artistId".into(), Value::String(v.to_string()));
        }
        self.procedure("app.rocksky.library.star", Value::Object(body))
            .await
    }

    /// Call the procedure `app.rocksky.library.unstar` (auth required).
    pub async fn unstar(
        &self,
        id: &str,
        album_id: Option<&str>,
        artist_id: Option<&str>,
    ) -> Result<Value> {
        let mut body = serde_json::Map::new();
        body.insert("id".into(), Value::String(id.to_string()));
        if let Some(v) = album_id {
            body.insert("albumId".into(), Value::String(v.to_string()));
        }
        if let Some(v) = artist_id {
            body.insert("artistId".into(), Value::String(v.to_string()));
        }
        self.procedure("app.rocksky.library.unstar", Value::Object(body))
            .await
    }

    /// Query `app.rocksky.library.getPlaylists` (auth required).
    pub async fn get_playlists(&self) -> Result<Value> {
        self.query("app.rocksky.library.getPlaylists", Vec::new())
            .await
    }

    /// Query `app.rocksky.library.getPlaylist` (auth required).
    pub async fn get_playlist(&self, id: &str) -> Result<Value> {
        let mut params: Vec<(&str, String)> = Vec::new();
        params.push(("id", id.to_string()));
        self.query("app.rocksky.library.getPlaylist", params).await
    }

    /// Call the procedure `app.rocksky.library.createPlaylist` (auth required).
    pub async fn create_playlist(&self, name: &str) -> Result<Value> {
        let mut body = serde_json::Map::new();
        body.insert("name".into(), Value::String(name.to_string()));
        self.procedure("app.rocksky.library.createPlaylist", Value::Object(body))
            .await
    }

    /// Call the procedure `app.rocksky.library.updatePlaylist` (auth required).
    pub async fn update_playlist(
        &self,
        playlist_id: &str,
        name: Option<&str>,
        comment: Option<&str>,
        song_id_to_add: Option<&str>,
        song_index_to_remove: Option<i64>,
    ) -> Result<Value> {
        let mut body = serde_json::Map::new();
        body.insert("playlistId".into(), Value::String(playlist_id.to_string()));
        if let Some(v) = name {
            body.insert("name".into(), Value::String(v.to_string()));
        }
        if let Some(v) = comment {
            body.insert("comment".into(), Value::String(v.to_string()));
        }
        if let Some(v) = song_id_to_add {
            body.insert("songIdToAdd".into(), Value::String(v.to_string()));
        }
        if let Some(v) = song_index_to_remove {
            body.insert("songIndexToRemove".into(), Value::Number(v.into()));
        }
        self.procedure("app.rocksky.library.updatePlaylist", Value::Object(body))
            .await
    }

    /// Call the procedure `app.rocksky.library.deletePlaylist` (auth required).
    pub async fn delete_playlist(&self, id: &str) -> Result<Value> {
        let mut body = serde_json::Map::new();
        body.insert("id".into(), Value::String(id.to_string()));
        self.procedure("app.rocksky.library.deletePlaylist", Value::Object(body))
            .await
    }

    /// Call the procedure `app.rocksky.library.deleteSong` (auth required).
    pub async fn delete_song(&self, id: &str) -> Result<Value> {
        let mut body = serde_json::Map::new();
        body.insert("id".into(), Value::String(id.to_string()));
        self.procedure("app.rocksky.library.deleteSong", Value::Object(body))
            .await
    }

    /// Call the procedure `app.rocksky.library.deleteAlbum` (auth required).
    pub async fn delete_album(&self, id: &str) -> Result<Value> {
        let mut body = serde_json::Map::new();
        body.insert("id".into(), Value::String(id.to_string()));
        self.procedure("app.rocksky.library.deleteAlbum", Value::Object(body))
            .await
    }

    /// Call the procedure `app.rocksky.library.scrobble` (auth required).
    pub async fn scrobble(
        &self,
        id: &str,
        time: Option<i64>,
        submission: Option<bool>,
    ) -> Result<Value> {
        let mut body = serde_json::Map::new();
        body.insert("id".into(), Value::String(id.to_string()));
        if let Some(v) = time {
            body.insert("time".into(), Value::Number(v.into()));
        }
        if let Some(v) = submission {
            body.insert("submission".into(), Value::Bool(v));
        }
        self.procedure("app.rocksky.library.scrobble", Value::Object(body))
            .await
    }

    /// Call the procedure `app.rocksky.library.updateNowPlaying` (auth required).
    pub async fn update_now_playing(&self, id: &str) -> Result<Value> {
        let mut body = serde_json::Map::new();
        body.insert("id".into(), Value::String(id.to_string()));
        self.procedure("app.rocksky.library.updateNowPlaying", Value::Object(body))
            .await
    }

    /// Query `app.rocksky.library.getNowPlaying` (auth required).
    pub async fn get_now_playing(&self) -> Result<Value> {
        self.query("app.rocksky.library.getNowPlaying", Vec::new())
            .await
    }

    /// Query `app.rocksky.library.getPlayQueue` (auth required).
    pub async fn get_play_queue(&self) -> Result<Value> {
        self.query("app.rocksky.library.getPlayQueue", Vec::new())
            .await
    }

    /// Call the procedure `app.rocksky.library.savePlayQueue` (auth required).
    pub async fn save_play_queue(
        &self,
        id: Option<&str>,
        current: Option<&str>,
        position: Option<i64>,
    ) -> Result<Value> {
        let mut body = serde_json::Map::new();
        if let Some(v) = id {
            body.insert("id".into(), Value::String(v.to_string()));
        }
        if let Some(v) = current {
            body.insert("current".into(), Value::String(v.to_string()));
        }
        if let Some(v) = position {
            body.insert("position".into(), Value::Number(v.into()));
        }
        self.procedure("app.rocksky.library.savePlayQueue", Value::Object(body))
            .await
    }

    /// Resolve a media/art URL from `app.rocksky.library.getStreamUrl` (auth required).
    pub async fn get_stream_url(
        &self,
        id: &str,
        max_bit_rate: Option<i64>,
        format: Option<&str>,
    ) -> Result<Value> {
        let mut params: Vec<(&str, String)> = Vec::new();
        params.push(("id", id.to_string()));
        if let Some(v) = max_bit_rate {
            params.push(("maxBitRate", v.to_string()));
        }
        if let Some(v) = format {
            params.push(("format", v.to_string()));
        }
        self.query("app.rocksky.library.getStreamUrl", params).await
    }

    /// Resolve a media/art URL from `app.rocksky.library.getDownloadUrl` (auth required).
    pub async fn get_download_url(&self, id: &str) -> Result<Value> {
        let mut params: Vec<(&str, String)> = Vec::new();
        params.push(("id", id.to_string()));
        self.query("app.rocksky.library.getDownloadUrl", params)
            .await
    }

    /// Resolve a media/art URL from `app.rocksky.library.getCoverArtUrl` (auth required).
    pub async fn get_cover_art_url(&self, id: &str, size: Option<i64>) -> Result<Value> {
        let mut params: Vec<(&str, String)> = Vec::new();
        params.push(("id", id.to_string()));
        if let Some(v) = size {
            params.push(("size", v.to_string()));
        }
        self.query("app.rocksky.library.getCoverArtUrl", params)
            .await
    }

    /// Query `app.rocksky.library.getInternetRadioStations` (auth required).
    pub async fn get_internet_radio_stations(&self) -> Result<Value> {
        self.query("app.rocksky.library.getInternetRadioStations", Vec::new())
            .await
    }
}
