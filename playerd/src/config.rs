//! Daemon configuration: defaults <- TOML file <- environment <- CLI flags.
//!
//! The TOML follows the conventions of `~/.rocksky/settings.toml` (top-level
//! snake_case, camelCase inside `[equalizer]`) so values can be copied between
//! the two files verbatim.

use std::path::{Path, PathBuf};
use std::time::Duration;

use anyhow::{anyhow, bail, Context, Result};
use rockbox_playback::{
    CrossfadeMode, CrossfadeSettings, EqBand, Equalizer, MixMode, OutputConfig, PlayerConfig,
    RepeatMode, ReplayGainMode, EQ_BAND_FREQUENCIES,
};
use serde::{Deserialize, Deserializer};

/// TOML integers are not implicitly floats, but hand-written configs say
/// `volume = 1` or `fadeInDuration = 2`; accept both.
fn lenient_f32<'de, D: Deserializer<'de>>(d: D) -> Result<f32, D::Error> {
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum Num {
        I(i64),
        F(f64),
    }
    Ok(match Num::deserialize(d)? {
        Num::I(i) => i as f32,
        Num::F(f) => f as f32,
    })
}

fn lenient_f32_vec<'de, D: Deserializer<'de>>(d: D) -> Result<Vec<f32>, D::Error> {
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum Num {
        I(i64),
        F(f64),
    }
    Ok(Vec::<Num>::deserialize(d)?
        .into_iter()
        .map(|n| match n {
            Num::I(i) => i as f32,
            Num::F(f) => f as f32,
        })
        .collect())
}

#[derive(Deserialize, Clone)]
#[serde(default)]
pub struct Config {
    /// Device name shown in the miniplayer picker. Empty means hostname.
    pub name: String,
    pub ws_url: String,
    pub api_url: String,
    pub navidrome_url: String,
    /// Inline access token; usually left unset in favor of `token_path`.
    pub token: Option<String>,
    pub token_path: String,
    /// rockbox-playback output backend: "cpal" | "stdout" | "fifo:PATH" |
    /// "unix:PATH" | "tcp:ADDR". Empty means cpal.
    pub output: String,
    #[serde(deserialize_with = "lenient_f32")]
    pub volume: f32,
    pub shuffle: bool,
    /// "off" | "one" | "all"
    pub repeat: String,
    #[serde(deserialize_with = "lenient_f32")]
    pub buffer_seconds: f32,
    pub equalizer: EqualizerConfig,
}

#[derive(Deserialize, Clone)]
#[serde(default, rename_all = "camelCase")]
pub struct EqualizerConfig {
    pub enabled: bool,
    /// Gain in dB for the 10 bands at 32..16k Hz.
    #[serde(deserialize_with = "lenient_f32_vec")]
    pub bands: Vec<f32>,
    pub bass: i32,
    pub treble: i32,
    /// Crossfade mode: 0 off, 1 auto-skip, 2 manual-skip, 3 shuffle,
    /// 4 shuffle-or-manual, 5 always.
    pub crossfade: u8,
    #[serde(deserialize_with = "lenient_f32")]
    pub fade_in_delay: f32,
    #[serde(deserialize_with = "lenient_f32")]
    pub fade_in_duration: f32,
    #[serde(deserialize_with = "lenient_f32")]
    pub fade_out_delay: f32,
    #[serde(deserialize_with = "lenient_f32")]
    pub fade_out_duration: f32,
    /// 0 crossfade, 1 mix.
    pub mix_mode: u8,
    /// 0 track, 1 album, 2 shuffle (degrades to track), 3 off.
    pub replaygain: u8,
    #[serde(deserialize_with = "lenient_f32")]
    pub replaygain_preamp: f32,
    pub replaygain_clip: bool,
}

impl Default for EqualizerConfig {
    fn default() -> Self {
        EqualizerConfig {
            enabled: false,
            bands: vec![0.0; EQ_BAND_FREQUENCIES.len()],
            bass: 0,
            treble: 0,
            crossfade: 0,
            fade_in_delay: 0.0,
            fade_in_duration: 2.0,
            fade_out_delay: 0.0,
            fade_out_duration: 2.0,
            mix_mode: 0,
            replaygain: 3,
            replaygain_preamp: 0.0,
            replaygain_clip: true,
        }
    }
}

impl Default for Config {
    fn default() -> Self {
        Config {
            name: String::new(),
            ws_url: rocksky_sdk::DEFAULT_REMOTE_WS.to_string(),
            api_url: "https://api.rocksky.app".to_string(),
            navidrome_url: "https://navidrome.rocksky.app".to_string(),
            token: None,
            token_path: "~/.rocksky/token.json".to_string(),
            output: String::new(),
            volume: 1.0,
            shuffle: false,
            repeat: "off".to_string(),
            buffer_seconds: 10.0,
            equalizer: EqualizerConfig::default(),
        }
    }
}

pub fn expand_tilde(path: &str) -> PathBuf {
    if let Some(rest) = path.strip_prefix("~/") {
        if let Some(home) = dirs::home_dir() {
            return home.join(rest);
        }
    }
    PathBuf::from(path)
}

pub fn default_config_path() -> PathBuf {
    expand_tilde("~/.rocksky/playerd.toml")
}

impl Config {
    /// Load the TOML config. An explicitly given path must exist; the default
    /// path is optional.
    pub fn load(explicit: Option<&Path>) -> Result<Self> {
        let (path, required) = match explicit {
            Some(p) => (p.to_path_buf(), true),
            None => (default_config_path(), false),
        };
        if !path.exists() {
            if required {
                bail!("config file not found: {}", path.display());
            }
            return Ok(Config::default());
        }
        let raw = std::fs::read_to_string(&path)
            .with_context(|| format!("reading {}", path.display()))?;
        toml::from_str(&raw).with_context(|| format!("parsing {}", path.display()))
    }

    pub fn effective_name(&self) -> String {
        let name = self.name.trim();
        if !name.is_empty() {
            return name.to_string();
        }
        gethostname::gethostname().to_string_lossy().into_owned()
    }

    /// CLI/env token wins, then the inline config value, then the token file
    /// written by `rocksky login`.
    pub fn resolve_token(&self, cli_token: Option<String>) -> Result<String> {
        if let Some(token) = cli_token.filter(|t| !t.trim().is_empty()) {
            return Ok(token);
        }
        if let Some(token) = self.token.clone().filter(|t| !t.trim().is_empty()) {
            return Ok(token);
        }
        let path = expand_tilde(&self.token_path);
        if !path.exists() {
            bail!(
                "no access token: run `rocksky login` first (looked for {})",
                path.display()
            );
        }
        let raw = std::fs::read_to_string(&path)
            .with_context(|| format!("reading {}", path.display()))?;
        let value: serde_json::Value =
            serde_json::from_str(&raw).with_context(|| format!("parsing {}", path.display()))?;
        value
            .get("token")
            .and_then(|t| t.as_str())
            .map(String::from)
            .ok_or_else(|| anyhow!("no \"token\" field in {}", path.display()))
    }

    pub fn player_config(&self) -> Result<PlayerConfig> {
        let output = if self.output.trim().is_empty() {
            OutputConfig::Cpal
        } else {
            self.output
                .parse::<OutputConfig>()
                .map_err(|e| anyhow!("invalid output {:?}: {}", self.output, e.0))?
        };
        let repeat = match self.repeat.as_str() {
            "one" => RepeatMode::One,
            "all" => RepeatMode::All,
            "off" | "" => RepeatMode::Off,
            other => bail!("invalid repeat {:?}: expected off, one or all", other),
        };
        let eq = &self.equalizer;
        let crossfade = CrossfadeSettings {
            mode: match eq.crossfade {
                1 => CrossfadeMode::AutoSkip,
                2 => CrossfadeMode::ManualSkip,
                3 => CrossfadeMode::Shuffle,
                4 => CrossfadeMode::ShuffleOrManualSkip,
                5 => CrossfadeMode::Always,
                _ => CrossfadeMode::Off,
            },
            fade_out_delay: Duration::from_secs_f32(eq.fade_out_delay.max(0.0)),
            fade_out_duration: Duration::from_secs_f32(eq.fade_out_duration.max(0.0)),
            fade_in_delay: Duration::from_secs_f32(eq.fade_in_delay.max(0.0)),
            fade_in_duration: Duration::from_secs_f32(eq.fade_in_duration.max(0.0)),
            mix_mode: if eq.mix_mode == 1 {
                MixMode::Mix
            } else {
                MixMode::Crossfade
            },
        };
        let replaygain = match eq.replaygain {
            0 | 2 => ReplayGainMode::Track,
            1 => ReplayGainMode::Album,
            _ => ReplayGainMode::Off,
        };

        let mut config = PlayerConfig::builder()
            .output(output)
            .buffer_seconds(self.buffer_seconds.max(1.0))
            .volume(self.volume.clamp(0.0, 1.0))
            .shuffle(self.shuffle)
            .repeat(repeat)
            .crossfade(crossfade)
            .replaygain(replaygain, eq.replaygain_preamp, eq.replaygain_clip)
            .build();
        config.dsp.tone.bass_db = eq.bass;
        config.dsp.tone.treble_db = eq.treble;
        config.dsp.equalizer = Equalizer {
            enabled: eq.enabled,
            precut_db: 0.0,
            bands: EQ_BAND_FREQUENCIES
                .iter()
                .enumerate()
                .map(|(i, &cutoff_hz)| EqBand {
                    cutoff_hz,
                    q: 0.707,
                    gain_db: eq.bands.get(i).copied().unwrap_or(0.0),
                })
                .collect(),
        };
        Ok(config)
    }
}
