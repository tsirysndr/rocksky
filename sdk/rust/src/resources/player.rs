//! `app.rocksky.player.*` — remote playback control.

use serde::Serialize;
use serde_json::Value;

use crate::client::Client;
use crate::error::Result;

#[derive(Debug)]
pub struct PlayerApi<'a> {
    client: &'a Client,
}

#[derive(Debug, Default, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct PlayerIdParams {
    #[serde(skip_serializing_if = "Option::is_none")]
    player_id: Option<String>,
}

impl<'a> PlayerApi<'a> {
    pub(crate) fn new(client: &'a Client) -> Self {
        Self { client }
    }

    pub async fn currently_playing(
        &self,
        player_id: Option<&str>,
        actor: Option<&str>,
    ) -> Result<Value> {
        #[derive(Serialize)]
        #[serde(rename_all = "camelCase")]
        struct P<'a> {
            #[serde(skip_serializing_if = "Option::is_none")]
            player_id: Option<&'a str>,
            #[serde(skip_serializing_if = "Option::is_none")]
            actor: Option<&'a str>,
        }
        self.client
            .call_with(
                "app.rocksky.player.getCurrentlyPlaying",
                &P { player_id, actor },
                false,
            )
            .await
    }

    pub async fn queue(&self, player_id: Option<&str>) -> Result<Value> {
        self.client
            .call_with(
                "app.rocksky.player.getPlaybackQueue",
                &PlayerIdParams {
                    player_id: player_id.map(str::to_string),
                },
                false,
            )
            .await
    }

    pub async fn play(&self, player_id: Option<&str>) -> Result<Value> {
        self.simple_command("app.rocksky.player.play", player_id).await
    }
    pub async fn pause(&self, player_id: Option<&str>) -> Result<Value> {
        self.simple_command("app.rocksky.player.pause", player_id).await
    }
    pub async fn next(&self, player_id: Option<&str>) -> Result<Value> {
        self.simple_command("app.rocksky.player.next", player_id).await
    }
    pub async fn previous(&self, player_id: Option<&str>) -> Result<Value> {
        self.simple_command("app.rocksky.player.previous", player_id).await
    }

    pub async fn seek(&self, position: u64, player_id: Option<&str>) -> Result<Value> {
        #[derive(Serialize)]
        #[serde(rename_all = "camelCase")]
        struct P<'a> {
            #[serde(skip_serializing_if = "Option::is_none")]
            player_id: Option<&'a str>,
            position: u64,
        }
        self.client
            .procedure_as(
                "app.rocksky.player.seek",
                Some(&P {
                    player_id,
                    position,
                }),
                None::<&()>,
                true,
            )
            .await
    }

    pub async fn play_file(
        &self,
        file_id: impl Into<String>,
        player_id: Option<&str>,
    ) -> Result<Value> {
        #[derive(Serialize)]
        #[serde(rename_all = "camelCase")]
        struct P {
            #[serde(skip_serializing_if = "Option::is_none")]
            player_id: Option<String>,
            file_id: String,
        }
        self.client
            .procedure_as(
                "app.rocksky.player.playFile",
                Some(&P {
                    player_id: player_id.map(str::to_string),
                    file_id: file_id.into(),
                }),
                None::<&()>,
                true,
            )
            .await
    }

    pub async fn play_directory(
        &self,
        directory_id: impl Into<String>,
        player_id: Option<&str>,
        shuffle: Option<bool>,
        recurse: Option<bool>,
        position: Option<u32>,
    ) -> Result<Value> {
        #[derive(Serialize)]
        #[serde(rename_all = "camelCase")]
        struct P {
            #[serde(skip_serializing_if = "Option::is_none")]
            player_id: Option<String>,
            directory_id: String,
            #[serde(skip_serializing_if = "Option::is_none")]
            shuffle: Option<bool>,
            #[serde(skip_serializing_if = "Option::is_none")]
            recurse: Option<bool>,
            #[serde(skip_serializing_if = "Option::is_none")]
            position: Option<u32>,
        }
        self.client
            .procedure_as(
                "app.rocksky.player.playDirectory",
                Some(&P {
                    player_id: player_id.map(str::to_string),
                    directory_id: directory_id.into(),
                    shuffle,
                    recurse,
                    position,
                }),
                None::<&()>,
                true,
            )
            .await
    }

    pub async fn add_items_to_queue(
        &self,
        items: Vec<String>,
        player_id: Option<&str>,
        position: Option<u32>,
        shuffle: Option<bool>,
    ) -> Result<Value> {
        #[derive(Serialize)]
        #[serde(rename_all = "camelCase")]
        struct P {
            #[serde(skip_serializing_if = "Option::is_none")]
            player_id: Option<String>,
            items: Vec<String>,
            #[serde(skip_serializing_if = "Option::is_none")]
            position: Option<u32>,
            #[serde(skip_serializing_if = "Option::is_none")]
            shuffle: Option<bool>,
        }
        self.client
            .procedure_as(
                "app.rocksky.player.addItemsToQueue",
                Some(&P {
                    player_id: player_id.map(str::to_string),
                    items,
                    position,
                    shuffle,
                }),
                None::<&()>,
                true,
            )
            .await
    }

    async fn simple_command(&self, method: &str, player_id: Option<&str>) -> Result<Value> {
        self.client
            .procedure_as(
                method,
                Some(&PlayerIdParams {
                    player_id: player_id.map(str::to_string),
                }),
                None::<&()>,
                true,
            )
            .await
    }
}
