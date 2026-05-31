//! `app.rocksky.spotify.*` — Spotify playback control proxy.

use serde::Serialize;
use serde_json::Value;

use crate::client::Client;
use crate::error::Result;

#[derive(Debug)]
pub struct SpotifyApi<'a> {
    client: &'a Client,
}

impl<'a> SpotifyApi<'a> {
    pub(crate) fn new(client: &'a Client) -> Self {
        Self { client }
    }

    pub async fn currently_playing(&self, actor: Option<&str>) -> Result<Value> {
        #[derive(Serialize)]
        struct P<'a> {
            #[serde(skip_serializing_if = "Option::is_none")]
            actor: Option<&'a str>,
        }
        self.client
            .call_with("app.rocksky.spotify.getCurrentlyPlaying", &P { actor }, false)
            .await
    }

    pub async fn play(&self) -> Result<Value> {
        self.client
            .procedure_as("app.rocksky.spotify.play", None::<&()>, None::<&()>, true)
            .await
    }

    pub async fn pause(&self) -> Result<Value> {
        self.client
            .procedure_as("app.rocksky.spotify.pause", None::<&()>, None::<&()>, true)
            .await
    }

    pub async fn next(&self) -> Result<Value> {
        self.client
            .procedure_as("app.rocksky.spotify.next", None::<&()>, None::<&()>, true)
            .await
    }

    pub async fn previous(&self) -> Result<Value> {
        self.client
            .procedure_as("app.rocksky.spotify.previous", None::<&()>, None::<&()>, true)
            .await
    }

    pub async fn seek(&self, position: u64) -> Result<Value> {
        #[derive(Serialize)]
        struct P {
            position: u64,
        }
        self.client
            .procedure_as(
                "app.rocksky.spotify.seek",
                Some(&P { position }),
                None::<&()>,
                true,
            )
            .await
    }
}
