//! `app.rocksky.scrobble.*` — scrobbles.

use serde::Serialize;
use serde_json::Value;

use crate::client::Client;
use crate::error::Result;
use crate::models::{Scrobble, ScrobblesEnvelope};

#[derive(Debug)]
pub struct ScrobbleApi<'a> {
    client: &'a Client,
}

impl<'a> ScrobbleApi<'a> {
    pub(crate) fn new(client: &'a Client) -> Self {
        Self { client }
    }

    /// Get a single scrobble by AT-URI.
    pub async fn get(&self, uri: impl Into<String>) -> Result<Scrobble> {
        #[derive(Serialize)]
        struct P {
            uri: String,
        }
        self.client
            .query_as(
                "app.rocksky.scrobble.getScrobble",
                &P { uri: uri.into() },
                false,
            )
            .await
    }

    /// Builder for listing scrobbles.
    pub fn list(&self) -> ListScrobbles<'_> {
        ListScrobbles {
            client: self.client,
            params: ListScrobblesParams::default(),
        }
    }

    /// Create a scrobble. Requires auth.
    pub fn create(
        &self,
        title: impl Into<String>,
        artist: impl Into<String>,
    ) -> CreateScrobble<'_> {
        CreateScrobble {
            client: self.client,
            body: CreateScrobbleBody {
                title: title.into(),
                artist: artist.into(),
                ..Default::default()
            },
        }
    }
}

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct ListScrobblesParams {
    #[serde(skip_serializing_if = "Option::is_none")]
    did: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    following: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    limit: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    offset: Option<u32>,
}

#[derive(Debug)]
pub struct ListScrobbles<'a> {
    client: &'a Client,
    params: ListScrobblesParams,
}

impl<'a> ListScrobbles<'a> {
    /// Filter by actor DID.
    pub fn did(mut self, did: impl Into<String>) -> Self {
        self.params.did = Some(did.into());
        self
    }
    /// Restrict to the authenticated user's follow graph. Requires auth.
    pub fn following(mut self, following: bool) -> Self {
        self.params.following = Some(following);
        self
    }
    pub fn limit(mut self, limit: u32) -> Self {
        self.params.limit = Some(limit);
        self
    }
    pub fn offset(mut self, offset: u32) -> Self {
        self.params.offset = Some(offset);
        self
    }
    pub async fn send(self) -> Result<Vec<Scrobble>> {
        let auth = self.params.following.is_some();
        let env: ScrobblesEnvelope = self
            .client
            .query_as("app.rocksky.scrobble.getScrobbles", &self.params, auth)
            .await?;
        Ok(env.scrobbles)
    }
}

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct CreateScrobbleBody {
    title: String,
    artist: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    album: Option<String>,
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
    #[serde(skip_serializing_if = "Option::is_none")]
    composer: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    copyright_message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    artist_picture: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    spotify_link: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    lastfm_link: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tidal_link: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    apple_music_link: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    youtube_link: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    deezer_link: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    timestamp: Option<i64>,
}

#[derive(Debug)]
pub struct CreateScrobble<'a> {
    client: &'a Client,
    body: CreateScrobbleBody,
}

impl<'a> CreateScrobble<'a> {
    pub fn album(mut self, album: impl Into<String>) -> Self {
        self.body.album = Some(album.into());
        self
    }
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
    pub fn album_art(mut self, url: impl Into<String>) -> Self {
        self.body.album_art = Some(url.into());
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
    pub fn composer(mut self, c: impl Into<String>) -> Self {
        self.body.composer = Some(c.into());
        self
    }
    pub fn copyright_message(mut self, m: impl Into<String>) -> Self {
        self.body.copyright_message = Some(m.into());
        self
    }
    pub fn label(mut self, label: impl Into<String>) -> Self {
        self.body.label = Some(label.into());
        self
    }
    pub fn artist_picture(mut self, url: impl Into<String>) -> Self {
        self.body.artist_picture = Some(url.into());
        self
    }
    pub fn spotify_link(mut self, url: impl Into<String>) -> Self {
        self.body.spotify_link = Some(url.into());
        self
    }
    pub fn lastfm_link(mut self, url: impl Into<String>) -> Self {
        self.body.lastfm_link = Some(url.into());
        self
    }
    pub fn tidal_link(mut self, url: impl Into<String>) -> Self {
        self.body.tidal_link = Some(url.into());
        self
    }
    pub fn apple_music_link(mut self, url: impl Into<String>) -> Self {
        self.body.apple_music_link = Some(url.into());
        self
    }
    pub fn youtube_link(mut self, url: impl Into<String>) -> Self {
        self.body.youtube_link = Some(url.into());
        self
    }
    pub fn deezer_link(mut self, url: impl Into<String>) -> Self {
        self.body.deezer_link = Some(url.into());
        self
    }
    /// Unix seconds. If omitted, the server stamps it.
    pub fn timestamp(mut self, ts: i64) -> Self {
        self.body.timestamp = Some(ts);
        self
    }
    pub async fn send(self) -> Result<Value> {
        self.client
            .procedure_as(
                "app.rocksky.scrobble.createScrobble",
                None::<&()>,
                Some(&self.body),
                true,
            )
            .await
    }
}
