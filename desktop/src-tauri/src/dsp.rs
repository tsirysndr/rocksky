//! DSP command payloads shared between the Tauri commands and the engine
//! thread. Numeric codes match rockbox-wasm's documented raw ints so the
//! frontend shim can forward them unchanged.

use rockbox_playback::{
    ChannelMode, Compressor, Crossfeed, CrossfeedMode, EqBand, ReplayGainMode, Surround,
    ToneControls,
};
use rockbox_playback::{CrossfadeMode, CrossfadeSettings, MixMode};
use serde::Deserialize;
use std::time::Duration;

pub fn channel_mode(code: u8) -> ChannelMode {
    match code {
        1 => ChannelMode::Mono,
        2 => ChannelMode::Custom,
        3 => ChannelMode::MonoLeft,
        4 => ChannelMode::MonoRight,
        5 => ChannelMode::Karaoke,
        6 => ChannelMode::Swap,
        _ => ChannelMode::Stereo,
    }
}

/// wasm ints: 0 track, 1 album, 2 shuffle, 3 off. The native engine has no
/// shuffle-gain mode; it degrades to per-track gain.
pub fn replaygain_mode(code: u8) -> ReplayGainMode {
    match code {
        0 | 2 => ReplayGainMode::Track,
        1 => ReplayGainMode::Album,
        _ => ReplayGainMode::Off,
    }
}

pub fn crossfeed_mode(code: u8) -> CrossfeedMode {
    match code {
        1 => CrossfeedMode::Meier,
        2 => CrossfeedMode::Custom,
        _ => CrossfeedMode::Off,
    }
}

pub fn crossfade_mode(code: u8) -> CrossfadeMode {
    match code {
        1 => CrossfadeMode::AutoSkip,
        2 => CrossfadeMode::ManualSkip,
        3 => CrossfadeMode::Shuffle,
        4 => CrossfadeMode::ShuffleOrManualSkip,
        5 => CrossfadeMode::Always,
        _ => CrossfadeMode::Off,
    }
}

#[derive(Deserialize, Clone, Copy, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct CrossfadeOpts {
    pub fade_out_delay: f32,
    pub fade_out_duration: f32,
    pub fade_in_delay: f32,
    pub fade_in_duration: f32,
    /// 0 crossfade, 1 mix.
    pub mix_mode: u8,
}

pub fn crossfade_settings(mode: u8, opts: CrossfadeOpts) -> CrossfadeSettings {
    CrossfadeSettings {
        mode: crossfade_mode(mode),
        fade_out_delay: Duration::from_secs_f32(opts.fade_out_delay.max(0.0)),
        fade_out_duration: Duration::from_secs_f32(opts.fade_out_duration.max(0.0)),
        fade_in_delay: Duration::from_secs_f32(opts.fade_in_delay.max(0.0)),
        fade_in_duration: Duration::from_secs_f32(opts.fade_in_duration.max(0.0)),
        mix_mode: if opts.mix_mode == 1 {
            MixMode::Mix
        } else {
            MixMode::Crossfade
        },
    }
}

/// Mutable DSP state the engine thread accumulates, because the native
/// setters take whole structs while the wasm API updates them field-by-field
/// (setTone vs setToneCutoffs, setCrossfeed's mode+gains, per-band EQ).
#[derive(Default)]
pub struct DspState {
    pub tone: ToneControls,
    pub crossfeed: Crossfeed,
    pub eq_bands: Vec<EqBand>,
    pub eq_enabled: bool,
    pub eq_precut: f32,
}

#[derive(Deserialize, Clone, Copy)]
#[serde(rename_all = "camelCase")]
pub struct CompressorOpts {
    pub threshold: i32,
    pub makeup: i32,
    pub ratio: i32,
    pub knee: i32,
    pub release: i32,
    pub attack: i32,
}

pub fn compressor(opts: CompressorOpts) -> Compressor {
    Compressor {
        threshold_db: opts.threshold,
        makeup_gain: opts.makeup,
        ratio: opts.ratio,
        knee: opts.knee,
        attack_ms: opts.attack,
        release_ms: opts.release,
    }
}

#[derive(Deserialize, Clone, Copy, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct SurroundOpts {
    pub delay_ms: i32,
    pub balance: i32,
    pub fx1: i32,
    pub fx2: i32,
}

pub fn surround(opts: SurroundOpts) -> Surround {
    Surround {
        delay_ms: opts.delay_ms,
        balance: opts.balance,
        cutoff_low_hz: opts.fx1,
        cutoff_high_hz: opts.fx2,
    }
}
