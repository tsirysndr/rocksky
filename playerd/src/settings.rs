//! Cross-device audio settings from the user's atproto repo.
//!
//! The web/desktop apps persist DSP settings to the
//! `app.rocksky.rockbox.audio.settings` record (served by
//! `app.rocksky.rockbox.getAudioSettings`). This module fetches that record
//! once at startup, overlays it on the TOML `[equalizer]` baseline, applies
//! it to the engine, and then listens on the Jetstream firehose (all public
//! servers at once, like the SDK's repo-index hydration) for record commits —
//! an EQ tweak in the web player reaches this daemon in real time, with no
//! periodic polling.
//!
//! This daemon is strictly a *consumer* of the record: it never writes it
//! back, and [`SettingsSync`] applies only the sections whose content
//! actually changed — so a re-delivered or echoed document converges to zero
//! engine commands instead of looping.
//!
//! Saved EQ presets (`app.rocksky.equalizer` records) can be loaded at
//! startup via `equalizer.preset` in the TOML; they are resolved through
//! `app.rocksky.equalizer.listPresets` and become the EQ baseline.
//!
//! Wire units (same as rockbox internals): EQ gain and precut in tenths of a
//! dB (precut ≤ 0), Q ×10, tone in whole dB, fade times in ms, ReplayGain
//! preamp in tenths of a dB.

use std::sync::{Arc, Mutex};
use std::time::Duration;

use anyhow::{bail, Context, Result};
use rockbox_playback::{
    BassEnhancement, ChannelMode, Compressor, CrossfadeMode, CrossfadeSettings, Crossfeed,
    CrossfeedMode, EqBand, Equalizer, MixMode, PlayerConfig, ReplayGainMode, Surround,
    ToneControls, EQ_BAND_FREQUENCIES,
};
use rocksky_sdk::{
    jetstream, JetstreamConfig, RemoteAudioSettings, RemoteCrossfade, RemoteCrossfeed,
    RemoteCompressor, RemoteEqBand, RemoteEqualizer, RemotePbe, RemoteReplayGain, RemoteSurround,
    RemoteTone,
};
use serde::Deserialize;

use crate::engine::{Engine, EngineCmd};

const SETTINGS_COLLECTION: &str = "app.rocksky.rockbox.audio.settings";

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
            if available.is_empty() {
                "none"
            } else {
                available.as_str()
            }
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

impl From<&AudioSettingsView> for RemoteAudioSettings {
    fn from(v: &AudioSettingsView) -> Self {
        RemoteAudioSettings {
            equalizer: v.equalizer.as_ref().map(|e| RemoteEqualizer {
                enabled: e.enabled,
                precut: e.precut,
                bands: e.bands.as_ref().map(|bands| {
                    bands
                        .iter()
                        .map(|b| RemoteEqBand {
                            frequency: b.frequency,
                            gain: b.gain,
                            q: b.q,
                        })
                        .collect()
                }),
            }),
            tone: v.tone.as_ref().map(|t| RemoteTone {
                bass: t.bass,
                treble: t.treble,
                balance: t.balance,
                channels: t.channels.clone(),
                ..Default::default()
            }),
            crossfade: v.crossfade.as_ref().map(|c| RemoteCrossfade {
                mode: c.mode.clone(),
                fade_in_delay: c.fade_in_delay,
                fade_in_duration: c.fade_in_duration,
                fade_out_delay: c.fade_out_delay,
                fade_out_duration: c.fade_out_duration,
                fade_out_mix_mode: c.fade_out_mix_mode.clone(),
            }),
            replay_gain: v.replay_gain.as_ref().map(|r| RemoteReplayGain {
                mode: r.mode.clone(),
                preamp: r.preamp,
                prevent_clipping: r.prevent_clipping,
            }),
            ..Default::default()
        }
    }
}

/// Apply the sections the document specifies, each overlaid on the baseline.
///
/// Shared by the atproto settings record and the remote `audio_settings`
/// command — same units, same mappings, so a controller tweaking the EQ and the
/// user's saved record can never disagree about what a value means. Sections
/// this engine has no control for are simply not read.
pub fn apply(engine: &Engine, baseline: &Baseline, view: &RemoteAudioSettings) {
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
        if let Some(hz) = tone.bass_cutoff {
            controls.bass_cutoff_hz = hz;
        }
        if let Some(hz) = tone.treble_cutoff {
            controls.treble_cutoff_hz = hz;
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
                "wide" | "custom" => ChannelMode::Custom,
                "swap" => ChannelMode::Swap,
                _ => ChannelMode::Stereo,
            }));
        }
        if let Some(percent) = tone.stereo_width {
            engine.send(EngineCmd::SetStereoWidth(percent));
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

    if let Some(cf) = &view.crossfeed {
        let mut crossfeed = Crossfeed::default();
        if let Some(mode) = &cf.mode {
            crossfeed.mode = match mode.as_str() {
                "meier" => CrossfeedMode::Meier,
                "custom" => CrossfeedMode::Custom,
                _ => CrossfeedMode::Off,
            };
        }
        if let Some(gain) = cf.direct_gain {
            crossfeed.direct_gain = gain;
        }
        if let Some(gain) = cf.cross_gain {
            crossfeed.cross_gain = gain;
        }
        if let Some(gain) = cf.high_frequency_gain {
            crossfeed.high_freq_gain = gain;
        }
        if let Some(hz) = cf.cutoff {
            crossfeed.high_freq_cutoff = hz;
        }
        engine.send(EngineCmd::SetCrossfeed(crossfeed));
    }

    if let Some(c) = &view.compressor {
        let d = Compressor::default();
        engine.send(EngineCmd::SetCompressor(Compressor {
            threshold_db: c.threshold.unwrap_or(d.threshold_db),
            makeup_gain: c.makeup.unwrap_or(d.makeup_gain),
            ratio: c.ratio.unwrap_or(d.ratio),
            knee: c.knee.unwrap_or(d.knee),
            attack_ms: c.attack.unwrap_or(d.attack_ms),
            release_ms: c.release.unwrap_or(d.release_ms),
        }));
    }

    if let Some(sr) = &view.surround {
        let d = Surround::default();
        engine.send(EngineCmd::SetSurround(Surround {
            delay_ms: sr.delay.unwrap_or(d.delay_ms),
            balance: sr.balance.unwrap_or(d.balance),
            cutoff_low_hz: sr.fx1.unwrap_or(d.cutoff_low_hz),
            cutoff_high_hz: sr.fx2.unwrap_or(d.cutoff_high_hz),
        }));
    }

    if let Some(pbe) = &view.pbe {
        let d = BassEnhancement::default();
        engine.send(EngineCmd::SetBassEnhancement(BassEnhancement {
            strength: pbe.strength.unwrap_or(d.strength),
            precut: pbe.precut.unwrap_or(d.precut),
        }));
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

/// Section-diffing applier shared by every settings source (the atproto
/// record, Jetstream commits, and the remote `audio_settings` command).
///
/// Re-applying an identical EQ recomputes the IIR coefficients and audibly
/// disturbs playback — every controller that (re)connected and re-pushed its
/// snapshot caused a volume dip. Diffing per section means an unchanged or
/// echoed document costs zero engine commands, which also makes update
/// cycles between sources impossible: they converge instead of looping.
pub struct SettingsSync {
    baseline: Baseline,
    last: Mutex<RemoteAudioSettings>,
}

impl SettingsSync {
    pub fn new(baseline: Baseline) -> Self {
        SettingsSync {
            baseline,
            last: Mutex::new(RemoteAudioSettings::default()),
        }
    }

    /// Apply only the sections of `view` that are present AND differ from the
    /// last applied document.
    pub fn apply(&self, engine: &Engine, view: &RemoteAudioSettings) {
        let mut changed = RemoteAudioSettings::default();
        {
            let mut last = self.last.lock().unwrap();
            macro_rules! diff_section {
                ($field:ident) => {
                    if view.$field.is_some() && view.$field != last.$field {
                        changed.$field = view.$field.clone();
                        last.$field = view.$field.clone();
                    }
                };
            }
            diff_section!(equalizer);
            diff_section!(tone);
            diff_section!(crossfade);
            diff_section!(replay_gain);
            diff_section!(crossfeed);
            diff_section!(compressor);
            diff_section!(surround);
            diff_section!(pbe);
        }
        if changed.is_empty() {
            return;
        }
        apply(engine, &self.baseline, &changed);
    }

    /// The document that resets every section to the TOML baseline (each
    /// section present but empty, so [`apply`] overlays pure baseline).
    fn baseline_doc() -> RemoteAudioSettings {
        RemoteAudioSettings {
            equalizer: Some(RemoteEqualizer::default()),
            tone: Some(RemoteTone::default()),
            crossfade: Some(RemoteCrossfade::default()),
            replay_gain: Some(RemoteReplayGain::default()),
            crossfeed: Some(RemoteCrossfeed::default()),
            compressor: Some(RemoteCompressor::default()),
            surround: Some(RemoteSurround::default()),
            pbe: Some(RemotePbe::default()),
        }
    }
}

/// The authenticated user's DID, for the Jetstream `wantedDids` filter.
async fn fetch_did(http: &reqwest::Client, api_url: &str, token: &str) -> Result<String> {
    #[derive(Deserialize)]
    struct Profile {
        did: String,
    }
    let res = http
        .get(format!("{api_url}/xrpc/app.rocksky.actor.getProfile"))
        .bearer_auth(token)
        .send()
        .await
        .context("fetching own profile")?;
    if !res.status().is_success() {
        bail!("getProfile returned HTTP {}", res.status());
    }
    let profile: Profile = res.json().await.context("parsing getProfile response")?;
    Ok(profile.did)
}

/// Keep the engine's DSP in sync with the atproto record: one fetch at
/// startup, then live Jetstream commits — never a periodic poll. This task is
/// read-only towards the repo; it only ever sends engine commands.
/// `jetstream_urls` overrides the default public servers when non-empty.
pub async fn sync(
    engine: Arc<Engine>,
    sync: Arc<SettingsSync>,
    api_url: String,
    token: String,
    jetstream_urls: Vec<String>,
) {
    let http = reqwest::Client::new();

    match fetch(&http, &api_url, &token).await {
        Ok(Some(view)) => {
            tracing::info!(
                updated_at = view.updated_at.as_deref().unwrap_or("unknown"),
                "applying audio settings from atproto repo"
            );
            sync.apply(&engine, &(&view).into());
        }
        Ok(None) => tracing::debug!("no audio settings record; keeping local config"),
        Err(e) => tracing::warn!("audio settings fetch failed: {e}"),
    }

    let did = match fetch_did(&http, &api_url, &token).await {
        Ok(did) => did,
        Err(e) => {
            tracing::warn!("cannot resolve own DID, audio settings will not live-sync: {e:#}");
            return;
        }
    };

    let config = if jetstream_urls.is_empty() {
        JetstreamConfig::default()
    } else {
        JetstreamConfig::with_servers(jetstream_urls)
    }
    .wanted_collections(SETTINGS_COLLECTION);
    jetstream::watch(did, config, move |event| {
        if event.collection != SETTINGS_COLLECTION || event.rkey != "self" {
            return;
        }
        match event.operation.as_str() {
            "create" | "update" => {
                let Some(record) = event.record else { return };
                match serde_json::from_value::<AudioSettingsView>(record) {
                    Ok(view) => {
                        tracing::info!(
                            updated_at = view.updated_at.as_deref().unwrap_or("unknown"),
                            "applying audio settings from jetstream"
                        );
                        sync.apply(&engine, &(&view).into());
                    }
                    Err(e) => tracing::warn!("unparsable audio settings record: {e}"),
                }
            }
            "delete" => {
                tracing::info!("audio settings record deleted; reverting to local config");
                sync.apply(&engine, &SettingsSync::baseline_doc());
            }
            _ => {}
        }
    })
    .await;
}
