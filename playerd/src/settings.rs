//! Cross-device audio settings from the user's atproto repo.
//!
//! The web/desktop apps persist DSP settings to the
//! `app.rocksky.rockbox.audio.settings` record (served by
//! `app.rocksky.rockbox.getAudioSettings`). This module fetches that record,
//! overlays it on the TOML `[equalizer]` baseline, and applies it to the
//! engine — at startup and on a periodic refresh, so an EQ tweak in the web
//! player reaches this daemon without a restart.
//!
//! Saved EQ presets (`app.rocksky.equalizer` records) can be loaded at
//! startup via `equalizer.preset` in the TOML; they are resolved through
//! `app.rocksky.equalizer.listPresets` and become the EQ baseline.
//!
//! Wire units (same as rockbox internals): EQ gain and precut in tenths of a
//! dB (precut ≤ 0), Q ×10, tone in whole dB, fade times in ms, ReplayGain
//! preamp in tenths of a dB.

use std::sync::Arc;
use std::time::Duration;

use anyhow::{bail, Context, Result};
use rockbox_playback::{
    ChannelMode, CrossfadeMode, CrossfadeSettings, EqBand, Equalizer, MixMode, PlayerConfig,
    ReplayGainMode, ToneControls, EQ_BAND_FREQUENCIES,
};
use serde::Deserialize;

use crate::engine::{Engine, EngineCmd};

#[derive(Deserialize, Clone, PartialEq, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct AudioSettingsView {
    pub equalizer: Option<LexEqualizer>,
    pub tone: Option<LexTone>,
    pub crossfade: Option<LexCrossfade>,
    pub replay_gain: Option<LexReplayGain>,
    pub updated_at: Option<String>,
}

#[derive(Deserialize, Clone, PartialEq, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct LexEqualizer {
    pub enabled: Option<bool>,
    pub precut: Option<i32>,
    pub bands: Option<Vec<LexEqBand>>,
}

#[derive(Deserialize, Clone, PartialEq)]
pub struct LexEqBand {
    pub frequency: i32,
    pub gain: i32,
    pub q: i32,
}

#[derive(Deserialize, Clone, PartialEq, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct LexTone {
    pub bass: Option<i32>,
    pub treble: Option<i32>,
    pub balance: Option<i32>,
    pub channels: Option<String>,
}

#[derive(Deserialize, Clone, PartialEq, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct LexCrossfade {
    pub mode: Option<String>,
    pub fade_in_delay: Option<u64>,
    pub fade_in_duration: Option<u64>,
    pub fade_out_delay: Option<u64>,
    pub fade_out_duration: Option<u64>,
    pub fade_out_mix_mode: Option<String>,
}

#[derive(Deserialize, Clone, PartialEq, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct LexReplayGain {
    pub mode: Option<String>,
    pub preamp: Option<i32>,
    pub prevent_clipping: Option<bool>,
}

/// The `equalizer.preset` config value: either an AT URI to an
/// `app.rocksky.equalizer` record, or a name/rkey of one of the logged-in
/// user's own presets.
pub enum PresetSpec {
    Record { repo: String, rkey: String },
    Named(String),
}

impl PresetSpec {
    pub fn parse(spec: &str) -> Result<Self> {
        let Some(rest) = spec.strip_prefix("at://") else {
            return Ok(PresetSpec::Named(spec.to_string()));
        };
        let mut parts = rest.split('/');
        let repo = parts.next().unwrap_or_default();
        let collection = parts.next().unwrap_or_default();
        let rkey = parts.next().unwrap_or_default();
        if repo.is_empty() || rkey.is_empty() || parts.next().is_some() {
            bail!(
                "invalid equalizer preset URI {spec:?}: expected at://<did-or-handle>/app.rocksky.equalizer/<rkey>"
            );
        }
        if collection != "app.rocksky.equalizer" {
            bail!(
                "equalizer preset URI {spec:?} points at collection {collection:?}, expected app.rocksky.equalizer"
            );
        }
        Ok(PresetSpec::Record {
            repo: repo.to_string(),
            rkey: rkey.to_string(),
        })
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LexPreset {
    rkey: String,
    name: String,
    precut: Option<i32>,
    #[serde(default)]
    bands: Vec<LexEqBand>,
}

/// Preset rkeys are the display name slugified (same rule as putPreset).
fn slugify(name: &str) -> String {
    name.trim()
        .to_lowercase()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join("-")
}

/// Resolve an EQ preset through `app.rocksky.equalizer.listPresets` — public
/// with `did` for AT-URI specs, authenticated for the user's own — and
/// return it as an enabled native equalizer.
pub async fn fetch_preset(
    http: &reqwest::Client,
    api_url: &str,
    token: &str,
    spec: &PresetSpec,
) -> Result<(String, Equalizer)> {
    let mut req = http.get(format!("{api_url}/xrpc/app.rocksky.equalizer.listPresets"));
    req = match spec {
        PresetSpec::Record { repo, .. } => req.query(&[("did", repo.as_str())]),
        PresetSpec::Named(_) => req.bearer_auth(token),
    };
    let res = req.send().await.context("fetching equalizer presets")?;
    if !res.status().is_success() {
        bail!("listPresets returned HTTP {}", res.status());
    }
    #[derive(Deserialize)]
    struct PresetsOutput {
        presets: Vec<LexPreset>,
    }
    let out: PresetsOutput = res.json().await.context("parsing listPresets response")?;
    let preset = match spec {
        PresetSpec::Record { rkey, .. } => out.presets.iter().find(|p| &p.rkey == rkey),
        PresetSpec::Named(name) => out
            .presets
            .iter()
            .find(|p| p.rkey == slugify(name) || p.name.eq_ignore_ascii_case(name.trim())),
    };
    let Some(preset) = preset else {
        let available = out
            .presets
            .iter()
            .map(|p| p.name.as_str())
            .collect::<Vec<_>>()
            .join(", ");
        bail!(
            "equalizer preset not found (available: {})",
            if available.is_empty() { "none" } else { available.as_str() }
        );
    };
    let equalizer = Equalizer {
        enabled: true,
        precut_db: -(preset.precut.unwrap_or(0) as f32) / 10.0,
        bands: preset
            .bands
            .iter()
            .enumerate()
            .map(|(i, b)| EqBand {
                cutoff_hz: EQ_BAND_FREQUENCIES.get(i).copied().unwrap_or(b.frequency),
                q: b.q as f32 / 10.0,
                gain_db: b.gain as f32 / 10.0,
            })
            .collect(),
    };
    Ok((preset.name.clone(), equalizer))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_preset_spec() {
        match PresetSpec::parse("at://did:plc:xyz/app.rocksky.equalizer/bass-boost").unwrap() {
            PresetSpec::Record { repo, rkey } => {
                assert_eq!(repo, "did:plc:xyz");
                assert_eq!(rkey, "bass-boost");
            }
            _ => panic!("expected Record"),
        }
        match PresetSpec::parse("Bass Boost").unwrap() {
            PresetSpec::Named(name) => assert_eq!(name, "Bass Boost"),
            _ => panic!("expected Named"),
        }
        assert!(PresetSpec::parse("at://did:plc:xyz/app.rocksky.scrobble/abc").is_err());
        assert!(PresetSpec::parse("at://did:plc:xyz/app.rocksky.equalizer").is_err());
        assert!(PresetSpec::parse("at://did:plc:xyz/app.rocksky.equalizer/a/b").is_err());
    }

    #[test]
    fn slugify_matches_rkey_rule() {
        assert_eq!(slugify("Bass Boost"), "bass-boost");
        assert_eq!(slugify("  Rock  "), "rock");
        assert_eq!(slugify("bass-boost"), "bass-boost");
    }
}

/// The startup DSP baseline from the TOML config, kept so lexicon overlays
/// have defaults for fields the record doesn't specify.
#[derive(Clone)]
pub struct Baseline {
    pub equalizer: Equalizer,
    pub tone: ToneControls,
    pub crossfade: CrossfadeSettings,
    pub replaygain: (ReplayGainMode, f32, bool),
}

impl Baseline {
    pub fn from_player_config(config: &PlayerConfig) -> Self {
        Baseline {
            equalizer: config.dsp.equalizer.clone(),
            tone: config.dsp.tone,
            crossfade: config.crossfade,
            replaygain: (
                config.replaygain_mode,
                config.replaygain_preamp_db,
                config.replaygain_prevent_clipping,
            ),
        }
    }
}

/// Apply the sections the record specifies, each overlaid on the baseline.
fn apply(engine: &Engine, baseline: &Baseline, view: &AudioSettingsView) {
    if let Some(eq) = &view.equalizer {
        let mut equalizer = baseline.equalizer.clone();
        if let Some(enabled) = eq.enabled {
            equalizer.enabled = enabled;
        }
        if let Some(precut) = eq.precut {
            // Lexicon: tenths of dB, ≤ 0. Native: dB of headroom, positive
            // attenuates.
            equalizer.precut_db = -(precut as f32) / 10.0;
        }
        if let Some(bands) = &eq.bands {
            // Band centre frequencies are the fixed rockbox band table, keyed
            // by index — only gain and Q are user data (same rule as the web
            // engine).
            equalizer.bands = bands
                .iter()
                .enumerate()
                .map(|(i, b)| EqBand {
                    cutoff_hz: EQ_BAND_FREQUENCIES.get(i).copied().unwrap_or(b.frequency),
                    q: b.q as f32 / 10.0,
                    gain_db: b.gain as f32 / 10.0,
                })
                .collect();
        }
        engine.send(EngineCmd::SetEqualizer(equalizer));
    }

    if let Some(tone) = &view.tone {
        let mut controls = baseline.tone;
        if let Some(bass) = tone.bass {
            controls.bass_db = bass;
        }
        if let Some(treble) = tone.treble {
            controls.treble_db = treble;
        }
        engine.send(EngineCmd::SetTone(controls));
        if let Some(balance) = tone.balance {
            engine.send(EngineCmd::SetBalance(balance.clamp(-100, 100)));
        }
        if let Some(channels) = &tone.channels {
            engine.send(EngineCmd::SetChannelMode(match channels.as_str() {
                "mono" => ChannelMode::Mono,
                "monoLeft" => ChannelMode::MonoLeft,
                "monoRight" => ChannelMode::MonoRight,
                "karaoke" => ChannelMode::Karaoke,
                "wide" => ChannelMode::Custom,
                _ => ChannelMode::Stereo,
            }));
        }
    }

    if let Some(crossfade) = &view.crossfade {
        let mut settings = baseline.crossfade;
        if let Some(mode) = &crossfade.mode {
            // Same mapping as the web engine: "enabled" means always,
            // album/track-change degrade to auto-skip.
            settings.mode = match mode.as_str() {
                "enabled" => CrossfadeMode::Always,
                "shuffle" => CrossfadeMode::Shuffle,
                "albumChange" | "trackChange" => CrossfadeMode::AutoSkip,
                _ => CrossfadeMode::Off,
            };
        }
        if let Some(ms) = crossfade.fade_in_delay {
            settings.fade_in_delay = Duration::from_millis(ms);
        }
        if let Some(ms) = crossfade.fade_in_duration {
            settings.fade_in_duration = Duration::from_millis(ms);
        }
        if let Some(ms) = crossfade.fade_out_delay {
            settings.fade_out_delay = Duration::from_millis(ms);
        }
        if let Some(ms) = crossfade.fade_out_duration {
            settings.fade_out_duration = Duration::from_millis(ms);
        }
        if let Some(mix) = &crossfade.fade_out_mix_mode {
            settings.mix_mode = if mix == "mix" {
                MixMode::Mix
            } else {
                MixMode::Crossfade
            };
        }
        engine.send(EngineCmd::SetCrossfade(settings));
    }

    if let Some(rg) = &view.replay_gain {
        let (mut mode, mut preamp_db, mut noclip) = baseline.replaygain;
        if let Some(m) = &rg.mode {
            mode = match m.as_str() {
                "track" | "trackIfShuffling" => ReplayGainMode::Track,
                "album" => ReplayGainMode::Album,
                _ => ReplayGainMode::Off,
            };
        }
        if let Some(preamp) = rg.preamp {
            preamp_db = preamp as f32 / 10.0;
        }
        if let Some(prevent) = rg.prevent_clipping {
            noclip = prevent;
        }
        engine.send(EngineCmd::SetReplaygain {
            mode,
            preamp_db,
            noclip,
        });
    }
}

async fn fetch(
    http: &reqwest::Client,
    api_url: &str,
    token: &str,
) -> Result<Option<AudioSettingsView>, String> {
    let res = http
        .get(format!(
            "{api_url}/xrpc/app.rocksky.rockbox.getAudioSettings"
        ))
        .bearer_auth(token)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if res.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(None);
    }
    if !res.status().is_success() {
        return Err(format!("HTTP {}", res.status()));
    }
    res.json::<AudioSettingsView>()
        .await
        .map(Some)
        .map_err(|e| e.to_string())
}

/// Keep the engine's DSP in sync with the atproto record. Re-applying only on
/// record change matters: re-pushing an identical EQ recomputes the IIR
/// coefficients and audibly disturbs playback.
pub async fn sync_loop(
    engine: Arc<Engine>,
    baseline: Baseline,
    api_url: String,
    token: String,
    refresh: Duration,
) {
    let http = reqwest::Client::new();
    let mut last: Option<AudioSettingsView> = None;
    let mut logged_error = false;
    loop {
        match fetch(&http, &api_url, &token).await {
            Ok(Some(view)) => {
                logged_error = false;
                if last.as_ref() != Some(&view) {
                    tracing::info!(
                        updated_at = view.updated_at.as_deref().unwrap_or("unknown"),
                        "applying audio settings from atproto repo"
                    );
                    apply(&engine, &baseline, &view);
                    last = Some(view);
                }
            }
            Ok(None) => {
                logged_error = false;
                tracing::debug!("no audio settings record; keeping local config");
            }
            Err(e) => {
                if !logged_error {
                    tracing::warn!("audio settings fetch failed: {e}");
                    logged_error = true;
                }
            }
        }
        tokio::time::sleep(refresh).await;
    }
}
