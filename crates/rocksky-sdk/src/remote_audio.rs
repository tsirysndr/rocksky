//! The audio-settings document carried by the remote-control protocol.
//!
//! Every field is optional, at every level, and that is the whole contract: a
//! controller sends whichever sections it wants to change, and a player applies
//! whichever it understands and silently ignores the rest. A player built on an
//! engine with no compressor is not required to reject a `compressor` section —
//! it just doesn't read it. That keeps a new section from breaking players that
//! predate it, in either direction.
//!
//! Units are the same ones the `app.rocksky.rockbox.audio.settings` record uses,
//! so a settings UI can put its saved document straight on the wire:
//!
//! | field | unit |
//! |---|---|
//! | EQ `gain`, `precut` | tenths of a dB (`precut` ≤ 0) |
//! | EQ `q` | Q × 10 |
//! | EQ `frequency` | Hz |
//! | `bass`, `treble` | whole dB |
//! | `bassCutoff`, `trebleCutoff` | Hz |
//! | crossfade fade times | milliseconds |
//! | `balance`, `stereoWidth` | percent |
//! | ReplayGain `preamp` | tenths of a dB |
//! | crossfeed gains | tenths of a dB |
//! | `cutoff` | Hz |
//! | compressor `attack`, `release` | milliseconds |
//! | surround `delay` | milliseconds |

use serde::{Deserialize, Serialize};

/// A partial audio-settings document. Absent sections mean "leave alone".
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct RemoteAudioSettings {
    pub equalizer: Option<RemoteEqualizer>,
    pub tone: Option<RemoteTone>,
    pub crossfade: Option<RemoteCrossfade>,
    pub replay_gain: Option<RemoteReplayGain>,
    pub crossfeed: Option<RemoteCrossfeed>,
    pub compressor: Option<RemoteCompressor>,
    pub surround: Option<RemoteSurround>,
    pub pbe: Option<RemotePbe>,
}

impl RemoteAudioSettings {
    /// True when no section is present — nothing for a player to apply.
    pub fn is_empty(&self) -> bool {
        *self == Self::default()
    }
}

/// Parametric equalizer. `bands` is positional: index 0 is the lowest band.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct RemoteEqualizer {
    pub enabled: Option<bool>,
    /// Tenths of a dB, ≤ 0.
    pub precut: Option<i32>,
    pub bands: Option<Vec<RemoteEqBand>>,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct RemoteEqBand {
    /// Centre frequency, Hz.
    pub frequency: i32,
    /// Tenths of a dB.
    pub gain: i32,
    /// Q × 10.
    pub q: i32,
}

/// Tone controls, channel routing and stereo width.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct RemoteTone {
    /// Whole dB.
    pub bass: Option<i32>,
    /// Whole dB.
    pub treble: Option<i32>,
    /// Hz.
    pub bass_cutoff: Option<i32>,
    /// Hz.
    pub treble_cutoff: Option<i32>,
    /// Percent, -100 (full left) ..= 100 (full right).
    pub balance: Option<i32>,
    /// `stereo` | `mono` | `custom` | `monoLeft` | `monoRight` | `karaoke` | `swap`.
    pub channels: Option<String>,
    /// Percent. Only meaningful with `channels: "custom"`.
    pub stereo_width: Option<i32>,
}

/// Crossfade between tracks.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct RemoteCrossfade {
    /// `off` | `enabled` | `shuffle` | `albumChange` | `trackChange`.
    pub mode: Option<String>,
    /// Milliseconds.
    pub fade_in_delay: Option<u64>,
    /// Milliseconds.
    pub fade_in_duration: Option<u64>,
    /// Milliseconds.
    pub fade_out_delay: Option<u64>,
    /// Milliseconds.
    pub fade_out_duration: Option<u64>,
    /// `crossfade` | `mix`.
    pub fade_out_mix_mode: Option<String>,
}

/// ReplayGain normalisation.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct RemoteReplayGain {
    /// `off` | `track` | `album` | `trackIfShuffling`.
    pub mode: Option<String>,
    /// Tenths of a dB.
    pub preamp: Option<i32>,
    pub prevent_clipping: Option<bool>,
}

/// Headphone crossfeed.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct RemoteCrossfeed {
    /// `off` | `meier` | `custom`.
    pub mode: Option<String>,
    /// Tenths of a dB.
    pub direct_gain: Option<i32>,
    /// Tenths of a dB.
    pub cross_gain: Option<i32>,
    /// Tenths of a dB.
    pub high_frequency_gain: Option<i32>,
    /// Hz.
    pub cutoff: Option<i32>,
}

/// Dynamic-range compressor.
#[derive(Clone, Copy, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct RemoteCompressor {
    /// dB.
    pub threshold: Option<i32>,
    /// dB.
    pub makeup: Option<i32>,
    pub ratio: Option<i32>,
    pub knee: Option<i32>,
    /// Milliseconds.
    pub attack: Option<i32>,
    /// Milliseconds.
    pub release: Option<i32>,
}

/// Surround / stereo-expansion effect.
#[derive(Clone, Copy, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct RemoteSurround {
    /// Milliseconds.
    pub delay: Option<i32>,
    pub balance: Option<i32>,
    /// Low cutoff, Hz.
    pub fx1: Option<i32>,
    /// High cutoff, Hz.
    pub fx2: Option<i32>,
}

/// Perceptual bass enhancement.
#[derive(Clone, Copy, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct RemotePbe {
    /// Percent.
    pub strength: Option<i32>,
    /// Tenths of a dB.
    pub precut: Option<i32>,
}

/// Queue repeat mode.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum RemoteRepeat {
    #[default]
    Off,
    /// Repeat the whole queue.
    All,
    /// Repeat the current track.
    One,
}

impl RemoteRepeat {
    /// Parse the wire value. Unknown strings are `Off`, so a player never
    /// guesses at a mode a newer controller invented.
    pub fn from_wire(s: &str) -> Self {
        match s {
            "all" => RemoteRepeat::All,
            "one" => RemoteRepeat::One,
            _ => RemoteRepeat::Off,
        }
    }

    pub fn as_wire(self) -> &'static str {
        match self {
            RemoteRepeat::Off => "off",
            RemoteRepeat::All => "all",
            RemoteRepeat::One => "one",
        }
    }
}
