//! Remote control over the WebSocket: a controllable player and a controller.
//!
//! ```sh
//! # player: advertises a fake track, obeys commands from any controller/miniplayer
//! ROCKSKY_TOKEN=<jwt> cargo run -p rocksky-sdk --features remote-player --example remote_control -- player
//!
//! # controller: lists your devices and pauses the first one it sees
//! ROCKSKY_TOKEN=<jwt> cargo run -p rocksky-sdk --features remote-player --example remote_control -- controller
//! ```

use std::env;

use rocksky_sdk::{
    RemoteCommand, RemoteController, RemoteControllerConfig, RemoteEvent, RemoteNowPlaying,
    RemotePlayer, RemotePlayerConfig, RemoteStatus,
};

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()),
        )
        .init();

    let token = env::var("ROCKSKY_TOKEN").expect("set ROCKSKY_TOKEN to a Rocksky access token");
    let role = env::args().nth(1).unwrap_or_else(|| "player".into());

    match role.as_str() {
        "controller" => run_controller(token).await,
        _ => run_player(token).await,
    }
}

async fn run_player(token: String) {
    let player = RemotePlayer::connect(RemotePlayerConfig::new(token, "Rust Example Player"));

    // Advertise something to play.
    player.set_now_playing(RemoteNowPlaying {
        title: "Chaser".into(),
        artist: "Calibro 35".into(),
        album: "Jazzploitation".into(),
        duration_ms: 182_320,
        is_playing: true,
        ..Default::default()
    });
    player.set_status(RemoteStatus::Playing);

    println!("player connected — waiting for commands (Ctrl-C to quit)…");
    while let Some(cmd) = player.next_command().await {
        match cmd {
            RemoteCommand::Play => {
                println!("▶ play");
                player.set_status(RemoteStatus::Playing);
            }
            RemoteCommand::Pause => {
                println!("⏸ pause");
                player.set_status(RemoteStatus::Paused);
            }
            RemoteCommand::Next => println!("⏭ next"),
            RemoteCommand::Previous => println!("⏮ previous"),
            RemoteCommand::Seek { position_ms } => println!("⏩ seek {position_ms}ms"),
            RemoteCommand::QueueJump { index } => println!("↦ jump to {index}"),
            RemoteCommand::QueueRemove { index } => println!("✕ remove {index}"),
            RemoteCommand::Enqueue { tracks, mode, .. } => {
                println!("+ enqueue {} track(s) ({mode})", tracks.len())
            }
        }
    }
}

async fn run_controller(token: String) {
    let controller =
        RemoteController::connect(RemoteControllerConfig::new(token, "Rust Example Controller"));

    println!("controller connected — listening for devices (Ctrl-C to quit)…");
    while let Some(event) = controller.next_event().await {
        match event {
            RemoteEvent::Devices { devices, .. } => {
                println!("devices: {}", devices.len());
                for d in &devices {
                    let np = d
                        .now_playing
                        .as_ref()
                        .map(|t| format!("{} — {}", t.artist, t.title))
                        .unwrap_or_else(|| "(idle)".into());
                    println!("  · {} [{}] {np}", d.name, d.device_id);
                }
                // Make the first device primary and pause it, as a demo.
                if let Some(first) = devices.first() {
                    controller.set_primary(first.device_id.clone());
                    controller.pause(Some(first.device_id.clone()));
                }
            }
            RemoteEvent::NowPlaying {
                device_name, track, ..
            } => println!("♪ {device_name}: {} — {}", track.artist, track.title),
            RemoteEvent::Status {
                device_name,
                status,
                ..
            } => println!("● {device_name}: {status:?}"),
            RemoteEvent::PrimaryChanged { device_id } => println!("★ primary → {device_id}"),
            RemoteEvent::DeviceRegistered { name, .. } => println!("+ device {name}"),
            RemoteEvent::DeviceUnregistered { device_id } => println!("- device {device_id}"),
            RemoteEvent::Queue {
                device_name, queue, ..
            } => println!("≡ {device_name}: {} in queue", queue.len()),
        }
    }
}
