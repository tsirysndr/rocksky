use anyhow::{Context, Result};
use std::path::PathBuf;

#[derive(Clone, Copy)]
pub enum CodecKind {
    Flac,
    Aac,
    Mp3,
    Opus,
}

#[derive(Clone)]
pub struct InputConfig {
    pub sample_rate: u32,
    pub channels: u16,
}
#[derive(Clone)]
pub struct OutputConfig {
    pub dir: PathBuf,
    pub segment_duration: u32,
    pub playlist_size: u32,
}
#[derive(Clone)]
pub struct EncoderConfig {
    pub codec: CodecKind,
    pub bitrate: String,
    pub flac_compression: u8,
}
impl EncoderConfig {
    pub fn bitrate_bps(&self) -> Result<u32> {
        self.bitrate.parse().context("invalid encoder bitrate")
    }
}
#[derive(Clone)]
pub struct Enabled {
    pub enabled: bool,
}
#[derive(Clone)]
pub struct Config {
    pub input: InputConfig,
    pub output: OutputConfig,
    pub encoder: EncoderConfig,
    pub hls: Enabled,
    pub dash: Enabled,
}
