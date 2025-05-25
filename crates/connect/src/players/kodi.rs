use std::{env, time::Duration};

use super::Player;
use anyhow::Error;
use async_trait::async_trait;
use base64::{engine::general_purpose::STANDARD, Engine as _};
use jsonrpsee::{
    core::{
        client::ClientT,
        params::{ArrayParams, ObjectParams},
    },
    http_client::{HttpClient, HttpClientBuilder},
    rpc_params,
};
use reqwest::header::HeaderMap;
use serde_json::{json, Value};
use tokio::sync::mpsc::Sender;

#[derive(Clone)]
pub struct KodiPlayer {
    client: HttpClient,
    player_id: usize,
}

pub fn new() -> Result<KodiPlayer, Error> {
    let user = env::var("KODI_USER")?;
    let password = env::var("KODI_PASSWORD")?;
    let mut headers = HeaderMap::new();
    headers.insert(
        http::header::AUTHORIZATION,
        format!(
            "Basic {}",
            STANDARD.encode(format!("{}:{}", user, password).as_bytes())
        )
        .parse()
        .unwrap(),
    );

    let kodi_url =
        env::var("KODI_URL").unwrap_or_else(|_| "http://localhost:8080/jsonrpc".to_string());

    let client = HttpClientBuilder::default()
        .set_headers(headers)
        .build(kodi_url)?;

    Ok(KodiPlayer {
        client,
        player_id: 0,
    })
}

impl KodiPlayer {
    pub async fn get_properties(&self, properties: Vec<&str>) -> Result<Value, Error> {
        let mut params = ObjectParams::new();
        params.insert("properties", properties)?;

        let response = self
            .client
            .request::<Value, ObjectParams>("Application.GetProperties", params)
            .await?;
        Ok(response)
    }

    pub async fn get_active_players(&self) -> Result<Value, Error> {
        let response = self
            .client
            .request::<Value, ArrayParams>("Application.GetActivePlayers", rpc_params![])
            .await?;
        Ok(response)
    }

    pub async fn set_player_id(&mut self, player_id: usize) -> Result<Self, Error> {
        self.player_id = player_id;
        Ok(self.clone())
    }
}

#[async_trait]
impl Player for KodiPlayer {
    async fn play(&self) -> Result<(), Error> {
        let mut params = ObjectParams::new();
        params.insert("playerid", self.player_id)?;
        let _response = self
            .client
            .request::<Value, ObjectParams>("Player.PlayPause", params)
            .await?;

        Ok(())
    }

    async fn pause(&self) -> Result<(), Error> {
        let mut params = ObjectParams::new();
        params.insert("playerid", self.player_id)?;
        let _response = self
            .client
            .request::<Value, ObjectParams>("Player.PlayPause", params)
            .await?;
        Ok(())
    }

    async fn next(&self) -> Result<(), Error> {
        let mut params = ObjectParams::new();
        params.insert("playerid", self.player_id)?;
        params.insert("to", "next")?;
        let _response = self
            .client
            .request::<Value, ObjectParams>("Player.GoTo", params)
            .await?;
        Ok(())
    }

    async fn previous(&self) -> Result<(), Error> {
        let mut params = ObjectParams::new();
        params.insert("playerid", self.player_id)?;
        params.insert("to", "previous")?;
        let _response = self
            .client
            .request::<Value, ObjectParams>("Player.GoTo", params)
            .await?;
        Ok(())
    }

    async fn seek(&self, position: u64) -> Result<(), Error> {
        let mut params = ObjectParams::new();
        params.insert("playerid", self.player_id)?;
        params.insert("value", position)?;
        let _response = self
            .client
            .request::<Value, ObjectParams>("Player.Seek", params)
            .await?;
        Ok(())
    }

    async fn broadcast_now_playing(&self, tx: Sender<String>) -> Result<(), Error> {
        loop {
            let mut params = ObjectParams::new();
            params.insert("playerid", self.player_id)?;
            params.insert(
                "properties",
                vec!["title", "artist", "album", "duration", "file"],
            )?;

            let current_track = self
                .client
                .request::<Value, ObjectParams>("Player.GetItem", params)
                .await?;

            let mut params = ObjectParams::new();
            params.insert("playerid", self.player_id)?;
            params.insert(
                "properties",
                vec!["time", "totaltime", "percentage", "speed"],
            )?;

            let progress = self
                .client
                .request::<Value, ObjectParams>("Player.GetProperties", params)
                .await?;

            println!("{:#?}", progress);

            let hours = progress
                .get("time")
                .and_then(|time| time.get("hours"))
                .and_then(Value::as_u64)
                .unwrap_or(0);
            let minutes = progress
                .get("time")
                .and_then(|time| time.get("minutes"))
                .and_then(Value::as_u64)
                .unwrap_or(0);
            let seconds = progress
                .get("time")
                .and_then(|time| time.get("seconds"))
                .and_then(Value::as_u64)
                .unwrap_or(0);
            let milliseconds = progress
                .get("time")
                .and_then(|time| time.get("milliseconds"))
                .and_then(Value::as_u64)
                .unwrap_or(0);

            tx.send(
            json!({
                "type": "track",
                "title": current_track
                    .get("item")
                    .and_then(|item| item.get("title"))
                    .and_then(Value::as_str)
                    .unwrap_or("Unknown Title"),
                "artist": current_track
                    .get("item")
                    .and_then(|item| item.get("artist"))
                    .and_then(Value::as_array)
                    .map(|arr| arr.iter().map(Value::as_str).map(|x| x.unwrap()).collect::<Vec<_>>().join(", "))
                    .unwrap_or("Unknown Artist".into()),
                // "album_artist": "",
                "album": current_track
                    .get("item")
                    .and_then(|item| item.get("album"))
                    .and_then(Value::as_str)
                    .unwrap_or("Unknown Album"),
                "length": current_track
                    .get("item")
                    .and_then(|item| item.get("duration"))
                    .and_then(Value::as_u64)
                    .unwrap_or(0) * 1000, // Convert to milliseconds
                "elapsed":  ((hours * 3600) + (minutes * 60) + seconds) * 1000 + milliseconds,
            })
            .to_string(),
          ).await?;

            tokio::time::sleep(Duration::from_secs(3)).await;
        }
    }

    async fn broadcast_status(&self, tx: Sender<String>) -> Result<(), Error> {
        loop {
            let mut params = ObjectParams::new();
            params.insert("playerid", self.player_id).unwrap();
            params.insert("properties", vec!["speed"]).unwrap();

            let response = self
                .client
                .request::<Value, ObjectParams>("Player.GetProperties", params)
                .await?;

            tx.send(
                json!({
                    "type": "status",
                    "status": match response.get("speed") {
                        Some(Value::Number(speed)) => match speed.as_i64() {
                            Some(0) => 2,
                            Some(_) => 1,
                            None => 2,
                        },
                        _ => 2,
                    },
                })
                .to_string(),
            )
            .await?;
            tokio::time::sleep(Duration::from_secs(3)).await;
        }
    }
}
