//! `app.rocksky.charts.*` — chart queries.

use chrono::{DateTime, Utc};
use serde::Serialize;
use serde_json::Value;

use crate::client::Client;
use crate::error::Result;
use crate::models::{
    ArtistBasic, ArtistsEnvelope, SongBasic, TracksEnvelope,
};

#[derive(Debug)]
pub struct ChartsApi<'a> {
    client: &'a Client,
}

impl<'a> ChartsApi<'a> {
    pub(crate) fn new(client: &'a Client) -> Self {
        Self { client }
    }

    /// Top tracks chart.
    pub fn top_tracks(&self) -> TopTracks<'_> {
        TopTracks {
            client: self.client,
            params: RangeParams::default(),
        }
    }

    /// Top artists chart.
    pub fn top_artists(&self) -> TopArtists<'_> {
        TopArtists {
            client: self.client,
            params: RangeParams::default(),
        }
    }

    /// Scrobble counts over time (time-series). Server returns a free-form
    /// shape; this method hands you the raw JSON.
    pub fn scrobbles_chart(&self) -> ScrobblesChart<'_> {
        ScrobblesChart {
            client: self.client,
            params: ScrobblesChartParams::default(),
        }
    }
}

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct RangeParams {
    #[serde(skip_serializing_if = "Option::is_none")]
    limit: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    offset: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    start_date: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    end_date: Option<String>,
}

macro_rules! range_chart {
    ($name:ident, $env_t:ty, $field:ident, $item:ty, $method:expr) => {
        #[derive(Debug)]
        pub struct $name<'a> {
            client: &'a Client,
            params: RangeParams,
        }

        impl<'a> $name<'a> {
            pub fn limit(mut self, limit: u32) -> Self {
                self.params.limit = Some(limit);
                self
            }
            pub fn offset(mut self, offset: u32) -> Self {
                self.params.offset = Some(offset);
                self
            }
            pub fn start_date(mut self, when: DateTime<Utc>) -> Self {
                self.params.start_date = Some(when.to_rfc3339());
                self
            }
            pub fn end_date(mut self, when: DateTime<Utc>) -> Self {
                self.params.end_date = Some(when.to_rfc3339());
                self
            }
            pub async fn send(self) -> Result<Vec<$item>> {
                let env: $env_t = self
                    .client
                    .query_as($method, &self.params, false)
                    .await?;
                Ok(env.$field)
            }
        }
    };
}

range_chart!(
    TopTracks,
    TracksEnvelope,
    tracks,
    SongBasic,
    "app.rocksky.charts.getTopTracks"
);
range_chart!(
    TopArtists,
    ArtistsEnvelope,
    artists,
    ArtistBasic,
    "app.rocksky.charts.getTopArtists"
);

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct ScrobblesChartParams {
    #[serde(skip_serializing_if = "Option::is_none")]
    did: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "artisturi")]
    artist_uri: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "albumuri")]
    album_uri: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "songuri")]
    song_uri: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    genre: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    from: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    to: Option<String>,
}

#[derive(Debug)]
pub struct ScrobblesChart<'a> {
    client: &'a Client,
    params: ScrobblesChartParams,
}

impl<'a> ScrobblesChart<'a> {
    pub fn did(mut self, did: impl Into<String>) -> Self {
        self.params.did = Some(did.into());
        self
    }
    pub fn artist_uri(mut self, uri: impl Into<String>) -> Self {
        self.params.artist_uri = Some(uri.into());
        self
    }
    pub fn album_uri(mut self, uri: impl Into<String>) -> Self {
        self.params.album_uri = Some(uri.into());
        self
    }
    pub fn song_uri(mut self, uri: impl Into<String>) -> Self {
        self.params.song_uri = Some(uri.into());
        self
    }
    pub fn genre(mut self, genre: impl Into<String>) -> Self {
        self.params.genre = Some(genre.into());
        self
    }
    pub fn from(mut self, when: DateTime<Utc>) -> Self {
        self.params.from = Some(when.to_rfc3339());
        self
    }
    pub fn to(mut self, when: DateTime<Utc>) -> Self {
        self.params.to = Some(when.to_rfc3339());
        self
    }
    pub async fn send(self) -> Result<Value> {
        self.client
            .call_with("app.rocksky.charts.getScrobblesChart", &self.params, false)
            .await
    }
}
