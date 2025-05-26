use std::{env, sync::Arc};

use anyhow::Error;
use futures_util::{SinkExt, StreamExt};
use owo_colors::OwoColorize;
use serde_json::{Value, json};
use tokio::sync::Mutex;
use tokio_tungstenite::connect_async;

use crate::players::{Player, get_current_player};

pub async fn connect_to_rocksky_websocket(token: String) -> Result<(), Error> {
    let rocksky_ws =
        env::var("ROCKSKY_WS").unwrap_or_else(|_| "wss://api.rocksky.app/ws".to_string());
    let (ws_stream, _) = connect_async(&rocksky_ws).await?;
    println!("Connected to {}", rocksky_ws);

    let (mut write, mut read) = ws_stream.split();
    let device_id = Arc::new(Mutex::new(String::new()));

    write
        .send(
            json!({
                "type": "register",
                "clientName": "Rockbox",
                "token": token
            })
            .to_string()
            .into(),
        )
        .await?;

    let (tx, mut rx) = tokio::sync::mpsc::channel::<String>(32);
    let tx_clone = tx.clone();

    tokio::spawn(async move {
        let player: Box<dyn Player + Send + Sync> = get_current_player().map_err(|err| {
            println!("Error getting current player: {}", err);
            err
        })?;
        player
            .broadcast_now_playing(tx_clone)
            .await
            .unwrap_or_else(|err| eprintln!("Error broadcasting now playing: {}", err));
        Ok::<(), Error>(())
    });

    tokio::spawn(async move {
        let player: Box<dyn Player + Send + Sync> = get_current_player().map_err(|err| {
            println!("Error getting current player: {}", err);
            err
        })?;
        player
            .broadcast_status(tx)
            .await
            .unwrap_or_else(|err| eprintln!("Error broadcasting status: {}", err));
        Ok::<(), Error>(())
    });

    {
        let device_id = Arc::clone(&device_id);
        let token = token.clone();
        tokio::spawn(async move {
            while let Some(msg) = rx.recv().await {
                println!("Sending message: {}", msg);
                let id = device_id.lock().await.clone();
                if let Err(err) = write
                    .send(
                        json!({
                            "type": "message",
                            "data": serde_json::from_str::<Value>(&msg).unwrap(),
                            "device_id": id,
                            "token": token
                        })
                        .to_string()
                        .into(),
                    )
                    .await
                {
                    eprintln!("Send error: {}", err);
                    break;
                }
            }
        });
    }

    while let Some(msg) = read.next().await {
        let msg = match msg {
            Ok(m) => m.to_string(),
            Err(e) => {
                eprintln!("Read error: {}", e);
                break;
            }
        };

        let msg: Value = serde_json::from_str(&msg)?;
        if let Some(id) = msg["deviceId"].as_str() {
            println!("Device ID: {}", id);
            *device_id.lock().await = id.to_string();
        }

        if let Some("command") = msg["type"].as_str() {
            if let Some(cmd) = msg["action"].as_str() {
                println!("Received command: {}", cmd);

                let player: Box<dyn Player> = get_current_player()?;

                if let Some("command") = msg["type"].as_str() {
                    if let Some(cmd) = msg["action"].as_str() {
                        match cmd {
                            "play" => player.play().await?,
                            "pause" => player.pause().await?,
                            "next" => player.next().await?,
                            "previous" => player.previous().await?,
                            "seek" => player.seek(msg["position"].as_u64().unwrap_or(0)).await?,
                            _ => {
                                eprintln!("Unknown command: {}", cmd.magenta());
                                continue;
                            }
                        }
                    } else {
                        println!("No action specified in command message, ignoring.");
                    }
                }
            }
        }
    }

    Ok(())
}
