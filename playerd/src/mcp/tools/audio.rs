//! DSP: the equalizer, tone, crossfade, ReplayGain and the rest of the
//! rockbox effect chain.
//!
//! Two different things live here. `get_audio_settings` reads the *saved*
//! settings — the `app.rocksky.rockbox.audio.settings` record in the
//! listener's atproto repo, which is what every Rocksky player starts from.
//! The setters push to a running player over the remote protocol, which takes
//! effect immediately but does not write the record: the next change to the
//! record (from the web or desktop app) wins again.

use anyhow::{anyhow, bail, Result};
use rockbox_playback::EQ_BAND_FREQUENCIES;
use rocksky_sdk::{RemoteAudioSettings, RemoteEqBand, RemoteEqualizer, RemoteTone};
use serde_json::{json, Value};

use super::{device_prop, parse_json, tool, Args, Ctx, SETTLE_MS};
use crate::mcp::protocol::strip_nulls;
use crate::mcp::state::settle;
use crate::settings::{self, PresetSpec};

/// Rockbox's Q is carried ×10; 0.7 is the neutral value the apps write.
const DEFAULT_Q: i32 = 7;

pub fn definitions() -> Vec<Value> {
    vec![
        tool(
            "get_audio_settings",
            "The listener's saved cross-device audio settings (the app.rocksky.rockbox.audio.settings record every Rocksky player starts from): equalizer, tone, crossfade and ReplayGain.",
            json!({}),
            &[],
        ),
        tool(
            "set_equalizer",
            "Shape the sound on a running player: 10-band EQ gains, bass and treble. Bands are 32, 64, 125, 250, 500, 1k, 2k, 4k, 8k and 16k Hz, in that order. Takes effect at once; it does not change the listener's saved settings.",
            json!({
                "device": device_prop(),
                "enabled": { "type": "boolean", "description": "Turn the equalizer on or off." },
                "bands_db": {
                    "type": "array",
                    "items": { "type": "number", "minimum": -24, "maximum": 24 },
                    "minItems": 10,
                    "maxItems": 10,
                    "description": "Gain in dB for each of the 10 bands, low to high. Keep within about ±12 dB.",
                },
                "precut_db": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 24,
                    "description": "Headroom attenuation applied before the EQ, in dB (0 = none). Set it near your largest positive band gain to avoid clipping.",
                },
                "bass_db": { "type": "integer", "minimum": -24, "maximum": 24, "description": "Bass tone control, whole dB." },
                "treble_db": { "type": "integer", "minimum": -24, "maximum": 24, "description": "Treble tone control, whole dB." },
            }),
            &[],
        ),
        tool(
            "list_equalizer_presets",
            "The listener's saved EQ presets (app.rocksky.equalizer records), with their bands.",
            json!({}),
            &[],
        ),
        tool(
            "apply_equalizer_preset",
            "Load a saved EQ preset onto a running player, by name or AT URI.",
            json!({
                "device": device_prop(),
                "preset": { "type": "string", "description": "Preset name (or rkey), or an at://did/app.rocksky.equalizer/rkey URI for someone else's." },
            }),
            &["preset"],
        ),
        tool(
            "set_audio_settings",
            "Push a full audio-settings document to a running player: any of equalizer, tone, crossfade, replayGain, crossfeed, compressor, surround and pbe. Sections you leave out are untouched, and a player ignores sections its engine does not implement. Use set_equalizer for plain EQ work; reach for this for crossfade, ReplayGain and the rest.",
            json!({
                "device": device_prop(),
                "settings": {
                    "type": "object",
                    "description": "Units: EQ gain/precut and ReplayGain preamp and crossfeed gains in TENTHS of a dB (precut <= 0); EQ q is Q x 10; bass/treble in whole dB; cutoffs in Hz; fade times and compressor attack/release in ms; balance and stereoWidth in percent.",
                    "properties": {
                        "equalizer": {
                            "type": "object",
                            "properties": {
                                "enabled": { "type": "boolean" },
                                "precut": { "type": "integer", "description": "Tenths of a dB, <= 0." },
                                "bands": {
                                    "type": "array",
                                    "items": {
                                        "type": "object",
                                        "properties": {
                                            "frequency": { "type": "integer", "description": "Centre frequency, Hz." },
                                            "gain": { "type": "integer", "description": "Tenths of a dB." },
                                            "q": { "type": "integer", "description": "Q x 10." },
                                        },
                                    },
                                },
                            },
                        },
                        "tone": {
                            "type": "object",
                            "properties": {
                                "bass": { "type": "integer" },
                                "treble": { "type": "integer" },
                                "bassCutoff": { "type": "integer" },
                                "trebleCutoff": { "type": "integer" },
                                "balance": { "type": "integer", "description": "-100 (left) to 100 (right)." },
                                "channels": { "type": "string", "enum": ["stereo", "mono", "custom", "monoLeft", "monoRight", "karaoke", "swap"] },
                                "stereoWidth": { "type": "integer", "description": "Percent; only with channels \"custom\"." },
                            },
                        },
                        "crossfade": {
                            "type": "object",
                            "properties": {
                                "mode": { "type": "string", "enum": ["off", "enabled", "shuffle", "albumChange", "trackChange"] },
                                "fadeInDelay": { "type": "integer" },
                                "fadeInDuration": { "type": "integer" },
                                "fadeOutDelay": { "type": "integer" },
                                "fadeOutDuration": { "type": "integer" },
                                "fadeOutMixMode": { "type": "string", "enum": ["crossfade", "mix"] },
                            },
                        },
                        "replayGain": {
                            "type": "object",
                            "properties": {
                                "mode": { "type": "string", "enum": ["off", "track", "album", "trackIfShuffling"] },
                                "preamp": { "type": "integer" },
                                "preventClipping": { "type": "boolean" },
                            },
                        },
                        "crossfeed": {
                            "type": "object",
                            "properties": {
                                "mode": { "type": "string", "enum": ["off", "meier", "custom"] },
                                "directGain": { "type": "integer" },
                                "crossGain": { "type": "integer" },
                                "highFrequencyGain": { "type": "integer" },
                                "cutoff": { "type": "integer" },
                            },
                        },
                        "compressor": {
                            "type": "object",
                            "properties": {
                                "threshold": { "type": "integer" },
                                "makeup": { "type": "integer" },
                                "ratio": { "type": "integer" },
                                "knee": { "type": "integer" },
                                "attack": { "type": "integer" },
                                "release": { "type": "integer" },
                            },
                        },
                        "surround": {
                            "type": "object",
                            "properties": {
                                "delay": { "type": "integer" },
                                "balance": { "type": "integer" },
                                "fx1": { "type": "integer" },
                                "fx2": { "type": "integer" },
                            },
                        },
                        "pbe": {
                            "type": "object",
                            "properties": {
                                "strength": { "type": "integer", "description": "Percent." },
                                "precut": { "type": "integer", "description": "Tenths of a dB." },
                            },
                        },
                    },
                },
            }),
            &["settings"],
        ),
    ]
}

pub async fn call(ctx: &Ctx, name: &str, args: &Args<'_>) -> Result<Option<Value>> {
    let result = match name {
        "get_audio_settings" => {
            let saved = settings::fetch_audio_settings(
                ctx.rocksky.http(),
                ctx.rocksky.api_url(),
                ctx.rocksky.token(),
            )
            .await
            .map_err(|e| anyhow!("fetching audio settings: {e}"))?;
            match saved {
                Some(view) => json!({
                    "settings": strip_nulls(serde_json::to_value(&view)?),
                    "source": "app.rocksky.rockbox.audio.settings",
                }),
                None => json!({
                    "settings": Value::Null,
                    "note": "No saved audio settings record — players are running on their local config.",
                }),
            }
        }

        "list_equalizer_presets" => {
            let presets = settings::list_presets(
                ctx.rocksky.http(),
                ctx.rocksky.api_url(),
                ctx.rocksky.token(),
                None,
            )
            .await?;
            json!({
                "presets": presets
                    .iter()
                    .map(|p| json!({
                        "name": p.name,
                        "rkey": p.rkey,
                        "precut": p.precut,
                        "bands": p.bands.iter().map(|b| json!({
                            "frequency": b.frequency,
                            "gainDb": b.gain as f32 / 10.0,
                        })).collect::<Vec<_>>(),
                    }))
                    .collect::<Vec<_>>(),
            })
        }

        "set_equalizer" => {
            ctx.player.ready().await;
            let target = ctx.player.resolve(args.device())?;

            let mut equalizer = RemoteEqualizer {
                enabled: args.bool("enabled"),
                precut: args.f32("precut_db").map(|db| -(db.abs() * 10.0) as i32),
                bands: None,
            };
            if let Some(bands) = args.array("bands_db") {
                if bands.len() != EQ_BAND_FREQUENCIES.len() {
                    bail!(
                        "bands_db needs exactly {} values (32, 64, 125, 250, 500, 1k, 2k, 4k, 8k, 16k Hz)",
                        EQ_BAND_FREQUENCIES.len()
                    );
                }
                equalizer.bands = Some(
                    bands
                        .iter()
                        .enumerate()
                        .map(|(i, gain)| RemoteEqBand {
                            frequency: EQ_BAND_FREQUENCIES[i],
                            gain: (gain.as_f64().unwrap_or(0.0) * 10.0).round() as i32,
                            q: DEFAULT_Q,
                        })
                        .collect(),
                );
                // Bands nobody switched on would be a silent no-op.
                equalizer.enabled = equalizer.enabled.or(Some(true));
            }

            let tone = match (args.i64("bass_db"), args.i64("treble_db")) {
                (None, None) => None,
                (bass, treble) => Some(RemoteTone {
                    bass: bass.map(|v| v as i32),
                    treble: treble.map(|v| v as i32),
                    ..Default::default()
                }),
            };

            let document = RemoteAudioSettings {
                equalizer: (equalizer != RemoteEqualizer::default()).then_some(equalizer),
                tone,
                ..Default::default()
            };
            if document.is_empty() {
                bail!("nothing to change — pass `enabled`, `bands_db`, `precut_db`, `bass_db` or `treble_db`");
            }
            ctx.player.set_audio_settings(&target, &document);
            settle(SETTLE_MS).await;
            json!({
                "ok": true,
                "device": target.describe(&ctx.player),
                "applied": strip_nulls(serde_json::to_value(&document)?),
                "note": "Applied to the running player only; the saved settings record is unchanged.",
            })
        }

        "apply_equalizer_preset" => {
            ctx.player.ready().await;
            let target = ctx.player.resolve(args.device())?;
            let spec = PresetSpec::parse(args.req_str("preset")?)?;
            let did = match &spec {
                PresetSpec::Record { repo, .. } => Some(repo.clone()),
                PresetSpec::Named(_) => None,
            };
            let presets = settings::list_presets(
                ctx.rocksky.http(),
                ctx.rocksky.api_url(),
                ctx.rocksky.token(),
                did.as_deref(),
            )
            .await?;
            let preset = settings::find_preset(&presets, &spec)?;
            let document = RemoteAudioSettings {
                equalizer: Some(RemoteEqualizer {
                    enabled: Some(true),
                    precut: preset.precut,
                    bands: Some(
                        preset
                            .bands
                            .iter()
                            .map(|b| RemoteEqBand {
                                frequency: b.frequency,
                                gain: b.gain,
                                q: b.q,
                            })
                            .collect(),
                    ),
                }),
                ..Default::default()
            };
            ctx.player.set_audio_settings(&target, &document);
            settle(SETTLE_MS).await;
            json!({
                "ok": true,
                "device": target.describe(&ctx.player),
                "preset": preset.name,
                "bands": preset
                    .bands
                    .iter()
                    .map(|b| json!({ "frequency": b.frequency, "gainDb": b.gain as f32 / 10.0 }))
                    .collect::<Vec<_>>(),
            })
        }

        "set_audio_settings" => {
            ctx.player.ready().await;
            let target = ctx.player.resolve(args.device())?;
            let raw = args
                .object("settings")
                .ok_or_else(|| anyhow!("missing required argument \"settings\""))?;
            let document: RemoteAudioSettings = parse_json(raw, "audio settings document")?;
            if document.is_empty() {
                bail!("`settings` has no recognised section");
            }
            ctx.player.set_audio_settings(&target, &document);
            settle(SETTLE_MS).await;
            json!({
                "ok": true,
                "device": target.describe(&ctx.player),
                "applied": strip_nulls(serde_json::to_value(&document)?),
                "note": "Applied to the running player only; the saved settings record is unchanged.",
            })
        }

        _ => return Ok(None),
    };
    Ok(Some(result))
}
