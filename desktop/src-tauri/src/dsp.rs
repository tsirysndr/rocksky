//! DSP command payloads shared between the Tauri commands and the engine
//! thread. Numeric codes match rockbox-wasm's documented raw ints so the
//! frontend shim can forward them unchanged.

use rockbox_playback::EQ_BAND_FREQUENCIES;
use rockbox_playback::{
    ChannelMode, Compressor, Crossfeed, CrossfeedMode, EqBand, ReplayGainMode, Surround,
    ToneControls,
};
use rockbox_playback::{CrossfadeMode, CrossfadeSettings, MixMode};
use rocksky_sdk::RemoteAudioSettings;
use serde::Deserialize;
use std::time::Duration;

use crate::engine::EngineCmd;

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

// ── Remote audio settings → engine commands ─────────────────────────────────

/// Translate a remote `audio_settings` document into engine commands.
///
/// The wire document is partial at every level (see
/// [`rocksky_sdk::RemoteAudioSettings`]): a controller sends only what it wants
/// changed, and anything absent is left alone. Fields this engine has no
/// control for are simply not read, which is what lets a newer controller talk
/// to an older player without either side negotiating.
///
/// Wire units are the lexicon's — tenths of a dB for EQ gain/precut and
/// ReplayGain preamp, Q ×10, milliseconds for fade times — and are converted
/// here to what each engine setter expects.
pub fn remote_audio_commands(s: &RemoteAudioSettings) -> Vec<EngineCmd> {
    let mut cmds = Vec::new();

    if let Some(eq) = &s.equalizer {
        if let Some(enabled) = eq.enabled {
            cmds.push(EngineCmd::SetEqEnabled(enabled));
        }
        if let Some(bands) = &eq.bands {
            for (band, b) in bands.iter().enumerate() {
                // Band centre frequencies are the fixed rockbox band table,
                // keyed by index — only gain and Q are user data.
                cmds.push(EngineCmd::SetEqBand {
                    band,
                    cutoff_hz: EQ_BAND_FREQUENCIES
                        .get(band)
                        .copied()
                        .unwrap_or(b.frequency),
                    q: b.q as f32 / 10.0,
                    gain_db: b.gain as f32 / 10.0,
                });
            }
        }
        if let Some(precut) = eq.precut {
            // Wire precut is ≤ 0; the setter takes positive dB of headroom.
            cmds.push(EngineCmd::SetEqPrecut(precut.unsigned_abs() as f32 / 10.0));
        }
    }

    if let Some(tone) = &s.tone {
        // set_tone takes both at once, so send it only when the document
        // actually carries one — otherwise a lone `balance` would reset them.
        if tone.bass.is_some() || tone.treble.is_some() {
            cmds.push(EngineCmd::SetTone {
                bass_db: tone.bass.unwrap_or(0),
                treble_db: tone.treble.unwrap_or(0),
            });
        }
        if tone.bass_cutoff.is_some() || tone.treble_cutoff.is_some() {
            cmds.push(EngineCmd::SetToneCutoffs {
                bass_hz: tone.bass_cutoff.unwrap_or(0),
                treble_hz: tone.treble_cutoff.unwrap_or(0),
            });
        }
        if let Some(balance) = tone.balance {
            cmds.push(EngineCmd::SetBalance(balance));
        }
        if let Some(channels) = &tone.channels {
            cmds.push(EngineCmd::SetChannelMode(channel_mode_code(channels)));
        }
        if let Some(percent) = tone.stereo_width {
            cmds.push(EngineCmd::SetStereoWidth(percent));
        }
    }

    if let Some(cf) = &s.crossfade {
        cmds.push(EngineCmd::SetCrossfade {
            mode: crossfade_mode_code(cf.mode.as_deref().unwrap_or("off")),
            opts: CrossfadeOpts {
                // Wire is milliseconds; CrossfadeOpts is seconds.
                fade_in_delay: cf.fade_in_delay.unwrap_or(0) as f32 / 1000.0,
                fade_in_duration: cf.fade_in_duration.unwrap_or(0) as f32 / 1000.0,
                fade_out_delay: cf.fade_out_delay.unwrap_or(0) as f32 / 1000.0,
                fade_out_duration: cf.fade_out_duration.unwrap_or(0) as f32 / 1000.0,
                mix_mode: u8::from(cf.fade_out_mix_mode.as_deref() == Some("mix")),
            },
        });
    }

    if let Some(rg) = &s.replay_gain {
        cmds.push(EngineCmd::SetReplaygain {
            mode: replaygain_mode_code(rg.mode.as_deref().unwrap_or("off")),
            noclip: rg.prevent_clipping.unwrap_or(true),
            preamp_db: rg.preamp.unwrap_or(0) as f32 / 10.0,
        });
    }

    if let Some(cf) = &s.crossfeed {
        cmds.push(EngineCmd::SetCrossfeed {
            mode: crossfeed_mode_code(cf.mode.as_deref().unwrap_or("off")),
            direct_gain: cf.direct_gain.unwrap_or(0),
            cross_gain: cf.cross_gain.unwrap_or(0),
            high_freq_gain: cf.high_frequency_gain.unwrap_or(0),
            hf_cutoff: cf.cutoff.unwrap_or(0),
        });
    }

    if let Some(c) = &s.compressor {
        cmds.push(EngineCmd::SetCompressor(CompressorOpts {
            threshold: c.threshold.unwrap_or(0),
            makeup: c.makeup.unwrap_or(0),
            ratio: c.ratio.unwrap_or(0),
            knee: c.knee.unwrap_or(0),
            release: c.release.unwrap_or(0),
            attack: c.attack.unwrap_or(0),
        }));
    }

    if let Some(sr) = &s.surround {
        cmds.push(EngineCmd::SetSurround(SurroundOpts {
            delay_ms: sr.delay.unwrap_or(0),
            balance: sr.balance.unwrap_or(0),
            fx1: sr.fx1.unwrap_or(0),
            fx2: sr.fx2.unwrap_or(0),
        }));
    }

    if let Some(pbe) = &s.pbe {
        cmds.push(EngineCmd::SetPbe {
            strength: pbe.strength.unwrap_or(0),
            precut: pbe.precut.unwrap_or(0),
        });
    }

    cmds
}

fn channel_mode_code(channels: &str) -> u8 {
    match channels {
        "mono" => 1,
        "custom" | "wide" => 2,
        "monoLeft" => 3,
        "monoRight" => 4,
        "karaoke" => 5,
        "swap" => 6,
        _ => 0,
    }
}

/// Same mapping the web engine uses: "enabled" means always, and the
/// album/track-change modes degrade to auto-skip.
fn crossfade_mode_code(mode: &str) -> u8 {
    match mode {
        "enabled" => 5,
        "shuffle" => 3,
        "albumChange" | "trackChange" => 1,
        _ => 0,
    }
}

fn replaygain_mode_code(mode: &str) -> u8 {
    match mode {
        "track" => 0,
        "album" => 1,
        "trackIfShuffling" => 2,
        _ => 3,
    }
}

fn crossfeed_mode_code(mode: &str) -> u8 {
    match mode {
        "meier" => 1,
        "custom" => 2,
        _ => 0,
    }
}
