//! Opt-in, pre-volume HLS broadcasting using the embedded hlsd pipeline.
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use anyhow::{bail, Context, Result};
use axum::extract::{Path, State};
use axum::http::{header, StatusCode};
use axum::response::{Html, IntoResponse, Response};
use axum::routing::get;
use axum::{Json, Router};
use hlsd_core::config as core;
use rockbox_playback::{tap::PcmTap, PlayerConfig};
use serde::Deserialize;
use tower_http::cors::CorsLayer;

#[derive(Clone, Debug, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct HlsConfig {
    pub enabled: bool,
    pub bind: String,
    pub port: u16,
    pub sample_rate: u32,
    pub codec: String,
    pub bitrate: u32,
    pub segment_duration: u32,
    pub playlist_size: u32,
    pub output_dir: String,
}

impl Default for HlsConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            bind: "127.0.0.1".into(),
            port: 8180,
            sample_rate: 48000,
            codec: "aac".into(),
            bitrate: 192000,
            segment_duration: 2,
            playlist_size: 6,
            output_dir: "~/.cache/rocksky/playerd-hls".into(),
        }
    }
}

impl HlsConfig {
    fn validate(&self) -> Result<()> {
        if !self.enabled {
            return Ok(());
        }
        if self.port == 0 {
            bail!("hls.port must be between 1 and 65535");
        }
        if ![44100, 48000].contains(&self.sample_rate) {
            bail!("hls.sample_rate must be 44100 or 48000");
        }
        if !["aac", "flac"].contains(&self.codec.as_str()) {
            bail!("hls.codec must be aac or flac");
        }
        if !(32000..=512000).contains(&self.bitrate) {
            bail!("hls.bitrate must be 32000..=512000");
        }
        if !(1..=10).contains(&self.segment_duration) {
            bail!("hls.segment_duration must be 1..=10 seconds");
        }
        if !(3..=30).contains(&self.playlist_size) {
            bail!("hls.playlist_size must be 3..=30");
        }
        Ok(())
    }

    fn pipeline(&self, dir: PathBuf) -> core::Config {
        core::Config {
            input: core::InputConfig {
                sample_rate: self.sample_rate,
                channels: 2,
            },
            output: core::OutputConfig {
                dir,
                segment_duration: self.segment_duration,
                playlist_size: self.playlist_size,
            },
            encoder: core::EncoderConfig {
                codec: if self.codec == "flac" {
                    core::CodecKind::Flac
                } else {
                    core::CodecKind::Aac
                },
                bitrate: self.bitrate.to_string(),
                flac_compression: 5,
            },
            hls: core::Enabled { enabled: true },
            dash: core::Enabled { enabled: false },
        }
    }
}

pub struct LiveHls {
    tap: Arc<PcmTap>,
    server: tokio::task::JoinHandle<()>,
    worker: Option<std::thread::JoinHandle<()>>,
    _dir: tempfile::TempDir,
}

impl Drop for LiveHls {
    fn drop(&mut self) {
        self.server.abort();
        self.tap.close();
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}

#[derive(Clone)]
struct Delivery {
    dir: PathBuf,
    session: String,
    healthy: Arc<AtomicBool>,
}

/// Disabled means no listener, encoder, capture buffer, or output-rate change.
pub async fn start(config: &HlsConfig, player: &mut PlayerConfig) -> Result<Option<LiveHls>> {
    config.validate()?;
    if !config.enabled {
        return Ok(None);
    }

    let listener = tokio::net::TcpListener::bind((config.bind.as_str(), config.port))
        .await
        .context("binding HLS listener")?;
    let root = crate::config::expand_tilde(&config.output_dir);
    std::fs::create_dir_all(&root).context("creating HLS output directory")?;
    let dir = tempfile::Builder::new().prefix("live-").tempdir_in(root)?;
    let pipeline = config.pipeline(dir.path().to_path_buf());
    // Validate the encoder before starting the audio device or background tasks.
    hlsd_core::codec::build(&pipeline).context("initializing HLS encoder")?;
    let (tap, reader) = PcmTap::new(config.sample_rate as usize * 2);
    let healthy = Arc::new(AtomicBool::new(true));
    let worker_health = healthy.clone();
    let worker = std::thread::Builder::new()
        .name("playerd-hls".into())
        .spawn(move || {
            if let Err(error) = hlsd_core::segmenter::run(&pipeline, Box::new(reader)) {
                tracing::error!(%error, "HLS encoder stopped; local playback is unaffected");
            }
            worker_health.store(false, Ordering::Relaxed);
        })?;
    let delivery = Delivery {
        dir: dir.path().to_path_buf(),
        session: dir
            .path()
            .file_name()
            .unwrap()
            .to_string_lossy()
            .into_owned(),
        healthy,
    };
    let server = tokio::spawn(async move {
        if let Err(error) = axum::serve(listener, router(delivery)).await {
            tracing::error!(%error, "HLS HTTP server stopped");
        }
    });
    player.sample_rate = Some(config.sample_rate);
    player.pcm_tap = Some(tap.clone());
    tracing::info!(
        "HLS enabled at http://{}:{}/stream.m3u8 ({}; pre-volume)",
        config.bind,
        config.port,
        config.codec
    );
    Ok(Some(LiveHls {
        tap,
        server,
        worker: Some(worker),
        _dir: dir,
    }))
}

fn router(delivery: Delivery) -> Router {
    Router::new()
        .route("/", get(|| async {
            Html("<!doctype html><html><head><meta charset=\"utf-8\"><title>Rocksky Live</title></head><body><h1>Rocksky Live</h1><a href=\"master.m3u8\">HLS playlist</a></body></html>")
        }))
        .route("/status", get(|State(state): State<Delivery>| async move {
            Json(serde_json::json!({ "enabled": true, "ready": state.healthy.load(Ordering::Relaxed) && state.dir.join("stream.m3u8").exists() }))
        }))
        .route("/{*path}", get(serve))
        .with_state(delivery)
        .layer(CorsLayer::permissive())
}

async fn serve(State(state): State<Delivery>, Path(path): Path<String>) -> Response {
    let playlist = matches!(path.as_str(), "master.m3u8" | "stream.m3u8");
    let filename = if playlist {
        path.as_str()
    } else if let Some(name) = path.strip_prefix(&format!("{}/", state.session)) {
        if name != "init.mp4" && !is_segment(name) {
            return StatusCode::NOT_FOUND.into_response();
        }
        name
    } else {
        return StatusCode::NOT_FOUND.into_response();
    };
    if playlist && !state.healthy.load(Ordering::Relaxed) {
        return unavailable();
    }
    let bytes = match tokio::fs::read(state.dir.join(filename)).await {
        Ok(bytes) => bytes,
        Err(_) if playlist => return unavailable(),
        Err(_) => return StatusCode::NOT_FOUND.into_response(),
    };
    if playlist {
        let text = String::from_utf8_lossy(&bytes);
        let body = if filename == "stream.m3u8" {
            // Session-qualified media URLs cannot collide with a previous run's
            // immutable init/segments, including through a CDN or reverse proxy.
            text.lines()
                .map(|line| {
                    if line == "#EXT-X-MAP:URI=\"init.mp4\"" {
                        format!("#EXT-X-MAP:URI=\"{}/init.mp4\"", state.session)
                    } else if is_segment(line) {
                        format!("{}/{}", state.session, line)
                    } else {
                        line.to_string()
                    }
                })
                .collect::<Vec<_>>()
                .join("\n")
                + "\n"
        } else {
            text.into_owned()
        };
        (
            [
                (header::CONTENT_TYPE, "application/vnd.apple.mpegurl"),
                (header::CACHE_CONTROL, "no-store"),
            ],
            body,
        )
            .into_response()
    } else {
        let mime = if filename == "init.mp4" {
            "audio/mp4"
        } else {
            "video/iso.segment"
        };
        (
            [
                (header::CONTENT_TYPE, mime),
                (header::CACHE_CONTROL, "public, max-age=3600, immutable"),
            ],
            bytes,
        )
            .into_response()
    }
}

fn unavailable() -> Response {
    (
        StatusCode::SERVICE_UNAVAILABLE,
        [
            (header::RETRY_AFTER, "1"),
            (header::CACHE_CONTROL, "no-store"),
        ],
        "Live stream is starting or unavailable",
    )
        .into_response()
}

fn is_segment(name: &str) -> bool {
    name.strip_prefix("seg-")
        .and_then(|s| s.strip_suffix(".m4s"))
        .is_some_and(|n| !n.is_empty() && n.bytes().all(|b| b.is_ascii_digit()))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn disabled_by_default_leaves_audio_config_untouched() {
        let config: crate::config::Config = toml::from_str("").unwrap();
        assert!(!config.hls.enabled);
        let mut player = PlayerConfig::default();
        assert!(start(&config.hls, &mut player).await.unwrap().is_none());
        assert!(player.pcm_tap.is_none());
        assert!(player.sample_rate.is_none());
    }
    #[test]
    fn validates_only_when_enabled() {
        let mut config = HlsConfig {
            port: 0,
            ..HlsConfig::default()
        };
        assert!(config.validate().is_ok());
        config.enabled = true;
        assert!(config.validate().is_err());
        config.port = 8180;
        assert!(config.validate().is_ok());
        config.segment_duration = 0;
        assert!(config.validate().is_err());
    }
    #[test]
    fn only_allows_media_filenames() {
        assert!(is_segment("seg-00001.m4s"));
        for name in [
            "../token.json",
            "seg-../token.m4s",
            "seg-.m4s",
            "init.mp4/other",
        ] {
            assert!(!is_segment(name));
        }
    }

    #[tokio::test]
    async fn serves_live_aac_from_muted_playback_with_cors_and_safe_paths() {
        use rockbox_playback::{OutputConfig, Player, SocketMode};
        use std::io::{Read, Write};
        use std::net::TcpListener;
        use std::time::{Duration, Instant};

        let temp = tempfile::tempdir().unwrap();
        let tone = temp.path().join("tone.wav");
        let samples: Vec<i16> = (0..48000 * 5)
            .flat_map(|n| {
                let value =
                    ((n as f32 * std::f32::consts::TAU * 440.0 / 48000.0).sin() * 12000.0) as i16;
                [value, value]
            })
            .collect();
        let mut wav = std::fs::File::create(&tone).unwrap();
        let len = (samples.len() * 2) as u32;
        wav.write_all(b"RIFF").unwrap();
        wav.write_all(&(36 + len).to_le_bytes()).unwrap();
        wav.write_all(b"WAVEfmt ").unwrap();
        wav.write_all(&16u32.to_le_bytes()).unwrap();
        wav.write_all(&1u16.to_le_bytes()).unwrap();
        wav.write_all(&2u16.to_le_bytes()).unwrap();
        wav.write_all(&48000u32.to_le_bytes()).unwrap();
        wav.write_all(&192000u32.to_le_bytes()).unwrap();
        wav.write_all(&4u16.to_le_bytes()).unwrap();
        wav.write_all(&16u16.to_le_bytes()).unwrap();
        wav.write_all(b"data").unwrap();
        wav.write_all(&len.to_le_bytes()).unwrap();
        for sample in samples {
            wav.write_all(&sample.to_le_bytes()).unwrap();
        }
        drop(wav);

        let sink = TcpListener::bind("127.0.0.1:0").unwrap();
        let sink_addr = sink.local_addr().unwrap();
        let drain = std::thread::spawn(move || {
            let (mut connection, _) = sink.accept().unwrap();
            let mut bytes = Vec::new();
            connection.read_to_end(&mut bytes).unwrap();
            bytes
        });
        let port = {
            let probe = TcpListener::bind("127.0.0.1:0").unwrap();
            probe.local_addr().unwrap().port()
        };
        let config = HlsConfig {
            enabled: true,
            port,
            segment_duration: 1,
            playlist_size: 3,
            output_dir: temp.path().join("hls").to_string_lossy().into_owned(),
            ..HlsConfig::default()
        };
        let mut player_config = PlayerConfig::default();
        player_config.output = OutputConfig::Tcp {
            addr: sink_addr.to_string(),
            mode: SocketMode::Connect,
        };
        player_config.volume = 0.0;
        let live = start(&config, &mut player_config).await.unwrap().unwrap();
        let player = Player::with_config(player_config).unwrap();
        player.set_queue(vec![tone]);
        player.play();
        let client = reqwest::Client::new();
        let base = format!("http://127.0.0.1:{port}");
        let started = Instant::now();
        let playlist = loop {
            let response = client
                .get(format!("{base}/stream.m3u8"))
                .header("Origin", "https://example.com")
                .send()
                .await
                .unwrap();
            if response.status().is_success() {
                assert_eq!(response.headers()["cache-control"], "no-store");
                assert_eq!(response.headers()["access-control-allow-origin"], "*");
                break response.text().await.unwrap();
            }
            assert!(
                started.elapsed() < Duration::from_secs(15),
                "no live playlist"
            );
            tokio::time::sleep(Duration::from_millis(100)).await;
        };
        assert!(playlist.contains("#EXT-X-MAP:URI=\"live-"));
        let media = playlist
            .lines()
            .find(|line| !line.starts_with('#') && line.ends_with(".m4s"))
            .unwrap();
        let init_uri = playlist
            .lines()
            .find_map(|line| {
                line.strip_prefix("#EXT-X-MAP:URI=\"")
                    .and_then(|s| s.strip_suffix('"'))
            })
            .unwrap();
        let init = client
            .get(format!("{base}/{init_uri}"))
            .send()
            .await
            .unwrap()
            .bytes()
            .await
            .unwrap();
        let segment = client
            .get(format!("{base}/{media}"))
            .send()
            .await
            .unwrap()
            .bytes()
            .await
            .unwrap();
        assert!(init.windows(4).any(|v| v == b"mp4a"));
        assert!(segment.windows(4).any(|v| v == b"moof"));
        assert!(segment.windows(4).any(|v| v == b"mdat"));
        let master = client
            .get(format!("{base}/master.m3u8"))
            .send()
            .await
            .unwrap()
            .text()
            .await
            .unwrap();
        assert!(master.contains("mp4a.40.2"));
        assert_eq!(
            client
                .get(format!("{base}/secret.toml"))
                .send()
                .await
                .unwrap()
                .status(),
            404
        );
        if let Ok(path) = std::env::var("PLAYERD_HLS_TEST_OUTPUT") {
            std::fs::write(path, [init.as_ref(), segment.as_ref()].concat()).unwrap();
        }
        drop(player);
        drop(live);
        assert!(
            drain.join().unwrap().iter().all(|b| *b == 0),
            "local zero-volume output was not silent"
        );
    }
}
