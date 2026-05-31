//! `app.rocksky.song.*` — song views and creation.

use serde::Serialize;
use serde_json::Value;

use crate::client::Client;
use crate::error::Result;
use crate::models::{
    ListenersEnvelope, RecentListener, Song, SongBasic, SongsEnvelope,
};

#[derive(Debug)]
pub struct SongApi<'a> {
    client: &'a Client,
}

impl<'a> SongApi<'a> {
    pub(crate) fn new(client: &'a Client) -> Self {
        Self { client }
    }

    /// Look up a song by AT-URI.
    pub async fn get(&self, uri: impl Into<String>) -> Result<Song> {
        self.get_by(GetSongLookup::default().uri(uri)).await
    }

    /// Look up a song by MusicBrainz ID.
    pub async fn get_by_mbid(&self, mbid: impl Into<String>) -> Result<Song> {
        self.get_by(GetSongLookup::default().mbid(mbid)).await
    }

    /// Look up a song by ISRC.
    pub async fn get_by_isrc(&self, isrc: impl Into<String>) -> Result<Song> {
        self.get_by(GetSongLookup::default().isrc(isrc)).await
    }

    /// Look up a song by Spotify track ID.
    pub async fn get_by_spotify_id(&self, spotify_id: impl Into<String>) -> Result<Song> {
        self.get_by(GetSongLookup::default().spotify_id(spotify_id)).await
    }

    /// Lower-level lookup — combine any of the supported identifiers.
    pub async fn get_by(&self, lookup: GetSongLookup) -> Result<Song> {
        self.client
            .query_as("app.rocksky.song.getSong", &lookup.params, false)
            .await
    }

    /// List songs.
    pub fn list(&self) -> ListSongs<'_> {
        ListSongs {
            client: self.client,
            params: ListSongsParams::default(),
        }
    }

    /// Recent listeners of a song.
    pub fn get_recent_listeners(&self, uri: impl Into<String>) -> GetSongRecentListeners<'_> {
        GetSongRecentListeners {
            client: self.client,
            params: SongUriPageParams {
                uri: uri.into(),
                limit: None,
                offset: None,
            },
        }
    }

    /// Resolve `(title, artist)` (plus optional identifiers) to a canonical song.
    pub fn match_song(
        &self,
        title: impl Into<String>,
        artist: impl Into<String>,
    ) -> MatchSong<'_> {
        MatchSong {
            client: self.client,
            params: MatchParams {
                title: title.into(),
                artist: artist.into(),
                mb_id: None,
                isrc: None,
            },
        }
    }

    /// Create (upsert) a song record. Requires auth.
    pub fn create(
        &self,
        title: impl Into<String>,
        artist: impl Into<String>,
        album: impl Into<String>,
        album_artist: impl Into<String>,
    ) -> CreateSong<'_> {
        CreateSong {
            client: self.client,
            body: CreateSongBody {
                title: title.into(),
                artist: artist.into(),
                album: album.into(),
                album_artist: album_artist.into(),
                duration: None,
                mb_id: None,
                isrc: None,
                album_art: None,
                track_number: None,
                release_date: None,
                year: None,
                disc_number: None,
                lyrics: None,
            },
        }
    }
}

/// Identifier bundle for [`SongApi::get_by`].
#[derive(Debug, Default)]
pub struct GetSongLookup {
    params: GetSongParams,
}

impl GetSongLookup {
    pub fn uri(mut self, uri: impl Into<String>) -> Self {
        self.params.uri = Some(uri.into());
        self
    }
    pub fn mbid(mut self, mbid: impl Into<String>) -> Self {
        self.params.mbid = Some(mbid.into());
        self
    }
    pub fn isrc(mut self, isrc: impl Into<String>) -> Self {
        self.params.isrc = Some(isrc.into());
        self
    }
    pub fn spotify_id(mut self, spotify_id: impl Into<String>) -> Self {
        self.params.spotify_id = Some(spotify_id.into());
        self
    }
}

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct GetSongParams {
    #[serde(skip_serializing_if = "Option::is_none")]
    uri: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    mbid: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    isrc: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    spotify_id: Option<String>,
}

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct ListSongsParams {
    #[serde(skip_serializing_if = "Option::is_none")]
    limit: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    offset: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    genre: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    mbid: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    isrc: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    spotify_id: Option<String>,
}

#[derive(Debug)]
pub struct ListSongs<'a> {
    client: &'a Client,
    params: ListSongsParams,
}

impl<'a> ListSongs<'a> {
    pub fn limit(mut self, limit: u32) -> Self {
        self.params.limit = Some(limit);
        self
    }
    pub fn offset(mut self, offset: u32) -> Self {
        self.params.offset = Some(offset);
        self
    }
    pub fn genre(mut self, genre: impl Into<String>) -> Self {
        self.params.genre = Some(genre.into());
        self
    }
    pub fn mbid(mut self, mbid: impl Into<String>) -> Self {
        self.params.mbid = Some(mbid.into());
        self
    }
    pub fn isrc(mut self, isrc: impl Into<String>) -> Self {
        self.params.isrc = Some(isrc.into());
        self
    }
    pub fn spotify_id(mut self, spotify_id: impl Into<String>) -> Self {
        self.params.spotify_id = Some(spotify_id.into());
        self
    }
    pub async fn send(self) -> Result<Vec<SongBasic>> {
        let env: SongsEnvelope = self
            .client
            .query_as("app.rocksky.song.getSongs", &self.params, false)
            .await?;
        Ok(env.songs)
    }
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct SongUriPageParams {
    uri: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    limit: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    offset: Option<u32>,
}

#[derive(Debug)]
pub struct GetSongRecentListeners<'a> {
    client: &'a Client,
    params: SongUriPageParams,
}

impl<'a> GetSongRecentListeners<'a> {
    pub fn limit(mut self, limit: u32) -> Self {
        self.params.limit = Some(limit);
        self
    }
    pub fn offset(mut self, offset: u32) -> Self {
        self.params.offset = Some(offset);
        self
    }
    pub async fn send(self) -> Result<Vec<RecentListener>> {
        let env: ListenersEnvelope<RecentListener> = self
            .client
            .query_as(
                "app.rocksky.song.getSongRecentListeners",
                &self.params,
                false,
            )
            .await?;
        Ok(env.listeners)
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct MatchParams {
    title: String,
    artist: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    mb_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    isrc: Option<String>,
}

#[derive(Debug)]
pub struct MatchSong<'a> {
    client: &'a Client,
    params: MatchParams,
}

impl<'a> MatchSong<'a> {
    pub fn mb_id(mut self, mb_id: impl Into<String>) -> Self {
        self.params.mb_id = Some(mb_id.into());
        self
    }
    pub fn isrc(mut self, isrc: impl Into<String>) -> Self {
        self.params.isrc = Some(isrc.into());
        self
    }
    pub async fn send(self) -> Result<Song> {
        self.client
            .query_as("app.rocksky.song.matchSong", &self.params, false)
            .await
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CreateSongBody {
    title: String,
    artist: String,
    album: String,
    album_artist: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    duration: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    mb_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    isrc: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    album_art: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    track_number: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    release_date: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    year: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    disc_number: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    lyrics: Option<String>,
}

#[derive(Debug)]
pub struct CreateSong<'a> {
    client: &'a Client,
    body: CreateSongBody,
}

impl<'a> CreateSong<'a> {
    pub fn duration(mut self, duration: u64) -> Self {
        self.body.duration = Some(duration);
        self
    }
    pub fn mb_id(mut self, mb_id: impl Into<String>) -> Self {
        self.body.mb_id = Some(mb_id.into());
        self
    }
    pub fn isrc(mut self, isrc: impl Into<String>) -> Self {
        self.body.isrc = Some(isrc.into());
        self
    }
    pub fn album_art(mut self, album_art: impl Into<String>) -> Self {
        self.body.album_art = Some(album_art.into());
        self
    }
    pub fn track_number(mut self, n: u32) -> Self {
        self.body.track_number = Some(n);
        self
    }
    pub fn release_date(mut self, date: impl Into<String>) -> Self {
        self.body.release_date = Some(date.into());
        self
    }
    pub fn year(mut self, year: i32) -> Self {
        self.body.year = Some(year);
        self
    }
    pub fn disc_number(mut self, n: u32) -> Self {
        self.body.disc_number = Some(n);
        self
    }
    pub fn lyrics(mut self, lyrics: impl Into<String>) -> Self {
        self.body.lyrics = Some(lyrics.into());
        self
    }
    pub async fn send(self) -> Result<Value> {
        self.client
            .procedure_as(
                "app.rocksky.song.createSong",
                None::<&()>,
                Some(&self.body),
                true,
            )
            .await
    }
}
