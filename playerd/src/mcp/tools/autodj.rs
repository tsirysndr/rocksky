//! Auto DJ: content-aware transitions, and the analysis that plans a set.
//!
//! Three things an agent can do here that it cannot do from metadata alone:
//! hand the transitions to the player's own analysis (`set_auto_dj`), find out
//! what a track actually sounds like (`analyze_tracks`), and order a pile of
//! candidates into a set that flows (`plan_set`).

use anyhow::{anyhow, bail, Result};
use oximedia_mir::dj_features::BeatMatcher;
use rocksky_sdk::{RemoteAudioSettings, RemoteCrossfade};
use serde_json::{json, Value};

use super::{device_prop, tool, Args, Ctx, SETTLE_MS};
use crate::analysis::TrackAnalysis;
use crate::mcp::analyzer::{Analyzed, MAX_BATCH};
use crate::mcp::state::settle;
use crate::mcp::subsonic::Song;
use crate::settings::AUTO_DJ_MODE;

pub fn definitions() -> Vec<Value> {
    vec![
        tool(
            "set_auto_dj",
            "Turn Auto DJ on or off on a player. With it on, the player analyses the track that is playing and the one after it and shapes each transition to the music — fading out where the last note is rather than through the silence after it, and covering the next track's lead-in inside the blend. Off restores a plain crossfade (or none).",
            json!({
                "device": device_prop(),
                "enabled": { "type": "boolean", "description": "Default true." },
                "overlap_seconds": {
                    "type": "number",
                    "minimum": 0.5,
                    "maximum": 15,
                    "description": "How much music-over-music blend each transition aims for (default 6). Short for spoken word or hard cuts, long for continuous dance sets.",
                },
                "crossfade_seconds": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 15,
                    "description": "Only when turning Auto DJ off: the plain crossfade to leave behind (0 = none).",
                },
            }),
            &[],
        ),
        tool(
            "analyze_tracks",
            "What tracks actually sound like: loudness (LUFS, true peak, the gain to level them), where the music starts and ends, tempo, musical key with its Camelot code, dynamic range, and an energy figure. The first analysis of a track downloads and decodes it (a second or two each); after that it is cached and instant.",
            json!({
                "ids": {
                    "type": "array",
                    "items": { "type": "string" },
                    "description": "Library track ids from search_library / browse_songs / get_album.",
                },
                "cached_only": {
                    "type": "boolean",
                    "description": "Return only what is already analysed, and never download (default false).",
                },
                "refresh": { "type": "boolean", "description": "Re-analyse even if cached." },
                "include_waveform": { "type": "boolean", "description": "Include the 200-bin waveform (default false)." },
            }),
            &["ids"],
        ),
        tool(
            "plan_set",
            "Order candidate tracks into a set that flows. Analyses each one, then sequences them so tempo, key and energy move sensibly from track to track instead of lurching. Returns the ordered ids — pass them straight to enqueue, which preserves order.",
            json!({
                "ids": {
                    "type": "array",
                    "items": { "type": "string" },
                    "description": "Candidate library track ids. More candidates than you need is fine — set `length` and the weakest fits are left out.",
                },
                "shape": {
                    "type": "string",
                    "enum": ["smooth", "build", "wind_down", "arc"],
                    "description": "\"smooth\" (default) keeps every transition easy; \"build\" rises in energy; \"wind_down\" falls; \"arc\" builds to a peak and comes back down.",
                },
                "length": { "type": "integer", "minimum": 2, "maximum": 40, "description": "How many tracks to keep (default: all of them)." },
                "opener": { "type": "string", "description": "Track id to start on. Defaults to whatever fits the shape." },
            }),
            &["ids"],
        ),
    ]
}

pub async fn call(ctx: &Ctx, name: &str, args: &Args<'_>) -> Result<Option<Value>> {
    let result = match name {
        "set_auto_dj" => {
            ctx.player.ready().await;
            let target = ctx.player.resolve(args.device())?;
            let enabled = args.bool("enabled").unwrap_or(true);

            let crossfade = if enabled {
                let overlap_ms =
                    (args.f32("overlap_seconds").unwrap_or(6.0).clamp(0.5, 15.0) * 1000.0) as u64;
                RemoteCrossfade {
                    mode: Some(AUTO_DJ_MODE.to_string()),
                    // Auto DJ reads the overlap off the fade durations, so the
                    // same document says both "auto" and "how much".
                    fade_out_duration: Some(overlap_ms),
                    fade_in_duration: Some(overlap_ms),
                    ..Default::default()
                }
            } else {
                let seconds = args
                    .f32("crossfade_seconds")
                    .unwrap_or(0.0)
                    .clamp(0.0, 15.0);
                let ms = (seconds * 1000.0) as u64;
                RemoteCrossfade {
                    mode: Some(if ms > 0 { "enabled" } else { "off" }.to_string()),
                    fade_out_duration: Some(ms),
                    fade_in_duration: Some(ms),
                    ..Default::default()
                }
            };
            let document = RemoteAudioSettings {
                crossfade: Some(crossfade),
                ..Default::default()
            };
            ctx.player.set_audio_settings(&target, &document);
            settle(SETTLE_MS).await;

            json!({
                "ok": true,
                "device": target.describe(&ctx.player),
                "autoDj": enabled,
                "note": if enabled {
                    "The player analyses each upcoming pair of tracks and shapes the transition. The first transition after a queue change may be a plain fade while the analysis runs."
                } else {
                    "Transitions are back to a fixed crossfade."
                },
            })
        }

        "analyze_tracks" => {
            let ids = string_list(args, "ids")?;
            let cached_only = args.bool("cached_only").unwrap_or(false);
            let include_waveform = args.bool("include_waveform").unwrap_or(false);
            let analyzed = gather(
                ctx,
                &ids,
                cached_only,
                args.bool("refresh").unwrap_or(false),
            )
            .await?;

            let mut tracks = Vec::with_capacity(analyzed.len());
            let mut pending = Vec::new();
            for item in &analyzed {
                match &item.analysis {
                    Some(analysis) => {
                        tracks.push(analysis_json(&item.song, analysis, include_waveform))
                    }
                    None => pending.push(json!({
                        "id": item.song.id,
                        "title": item.song.title,
                        "reason": item.error.clone().unwrap_or_else(|| "not analysed yet".into()),
                    })),
                }
            }
            let mut v = json!({ "tracks": tracks });
            if !pending.is_empty() {
                v["unavailable"] = json!(pending);
            }
            v
        }

        "plan_set" => {
            let ids = string_list(args, "ids")?;
            let shape = args.str("shape").unwrap_or("smooth").to_string();
            let analyzed = gather(ctx, &ids, false, false).await?;

            let mut usable: Vec<(Song, TrackAnalysis)> = analyzed
                .into_iter()
                .filter_map(|item| item.analysis.map(|analysis| (item.song, analysis)))
                .collect();
            if usable.len() < 2 {
                bail!(
                    "need at least two analysable tracks to plan a set (got {})",
                    usable.len()
                );
            }
            let length = args
                .u32("length")
                .map(|n| (n as usize).min(usable.len()))
                .unwrap_or(usable.len());
            let opener = args.str("opener").map(str::to_string);

            let order = sequence(&mut usable, &shape, length, opener.as_deref());
            let mut steps = Vec::with_capacity(order.len());
            for (position, index) in order.iter().enumerate() {
                let (song, analysis) = &usable[*index];
                let mut step = json!({
                    "position": position,
                    "id": song.id,
                    "title": song.title,
                    "artist": song.artist,
                    "bpm": analysis.dance_bpm().map(round1),
                    "key": analysis.camelot,
                    "energy": round2(analysis.energy()),
                });
                if position > 0 {
                    let (_, previous) = &usable[order[position - 1]];
                    step["transitionFromPrevious"] = transition_json(previous, analysis);
                }
                steps.push(step);
            }

            json!({
                "shape": shape,
                "trackIds": order
                    .iter()
                    .map(|index| usable[*index].0.id.clone())
                    .collect::<Vec<_>>(),
                "set": steps,
                "note": "Pass `trackIds` to enqueue in this order — it preserves order. Do not also pass shuffle.",
            })
        }

        _ => return Ok(None),
    };
    Ok(Some(result))
}

/// Resolve ids to songs and analyse them, honouring the batch ceiling.
async fn gather(
    ctx: &Ctx,
    ids: &[String],
    cached_only: bool,
    refresh: bool,
) -> Result<Vec<Analyzed>> {
    if ids.is_empty() {
        bail!("`ids` is empty");
    }
    if ids.len() > MAX_BATCH {
        bail!(
            "{} tracks is more than the {MAX_BATCH} this can analyse at once",
            ids.len()
        );
    }
    let subsonic = ctx.subsonic().await?;
    let mut songs = Vec::with_capacity(ids.len());
    for id in ids {
        match subsonic.song(id).await {
            Ok(song) => songs.push(song),
            Err(e) => tracing::warn!("plan: unknown track {id}: {e:#}"),
        }
    }
    if songs.is_empty() {
        bail!("none of those ids are in the library");
    }

    let analyzer = ctx.analyzer().await?;
    if cached_only {
        let mut out = Vec::with_capacity(songs.len());
        for song in songs {
            let analysis = analyzer.cached(&song.id).await;
            let error = analysis
                .is_none()
                .then(|| "not analysed yet — call again without cached_only".to_string());
            out.push(Analyzed {
                song,
                analysis,
                error,
            });
        }
        return Ok(out);
    }
    Ok(analyzer.analyze_all(subsonic, songs, refresh).await)
}

/// Order the candidates. Every shape is the same greedy walk — take the best
/// next track by transition cost — with a different idea of what "best" means.
fn sequence(
    tracks: &mut [(Song, TrackAnalysis)],
    shape: &str,
    length: usize,
    opener: Option<&str>,
) -> Vec<usize> {
    let energy: Vec<f32> = tracks.iter().map(|(_, a)| a.energy()).collect();
    let mut remaining: Vec<usize> = (0..tracks.len()).collect();

    let start = opener
        .and_then(|id| tracks.iter().position(|(song, _)| song.id == id))
        .unwrap_or_else(|| match shape {
            // Build and arc open low; a wind-down opens where the room is.
            "build" | "arc" => lowest(&energy, &remaining),
            "wind_down" => highest(&energy, &remaining),
            _ => lowest(&energy, &remaining),
        });
    remaining.retain(|index| *index != start);

    let mut order = vec![start];
    while order.len() < length && !remaining.is_empty() {
        let current = *order.last().expect("non-empty");
        let position = order.len() as f32 / length.max(2) as f32;
        let wanted = match shape {
            "build" => Some(position),
            "wind_down" => Some(1.0 - position),
            // Up to the two-thirds mark, then back down.
            "arc" => Some(if position < 0.66 {
                position / 0.66
            } else {
                (1.0 - position) / 0.34
            }),
            _ => None,
        };
        let next = remaining
            .iter()
            .copied()
            .min_by(|a, b| {
                let cost_a = cost(&tracks[current].1, &tracks[*a].1, wanted);
                let cost_b = cost(&tracks[current].1, &tracks[*b].1, wanted);
                cost_a.total_cmp(&cost_b)
            })
            .expect("remaining is non-empty");
        remaining.retain(|index| *index != next);
        order.push(next);
    }
    order
}

/// How awkward it would be to play `to` after `from`, lower is better.
///
/// Tempo and key are the DJ's two hard constraints, so they dominate: a jump
/// of more than about 8 BPM is audible, and a clash of keys is worse. Energy
/// is a soft pull toward wherever the shape wants to be at this point in the
/// set (`wanted`), or toward "don't lurch" when the shape has no opinion.
fn cost(from: &TrackAnalysis, to: &TrackAnalysis, wanted: Option<f32>) -> f32 {
    let tempo = match (from.dance_bpm(), to.dance_bpm()) {
        (Some(a), Some(b)) => {
            let matched = BeatMatcher::new().match_tracks(a, b, None, None);
            // The stretch a DJ would have to apply, as a fraction.
            (1.0 - matched.stretch_factor).abs().min(1.0)
        }
        // An unknown tempo is not a clash, but it is not a match either.
        _ => 0.15,
    };

    let key = match (from.key_root, from.key_major, to.key_root, to.key_major) {
        (Some(root_a), Some(major_a), Some(root_b), Some(major_b)) => {
            if oximedia_mir::dj_features::CamelotWheel::are_compatible(
                root_a, major_a, root_b, major_b,
            ) {
                0.0
            } else {
                1.0
            }
        }
        _ => 0.3,
    };

    let energy = match wanted {
        Some(target) => (to.energy() - target).abs(),
        None => (to.energy() - from.energy()).abs(),
    };

    3.0 * tempo + 1.0 * key + 1.5 * energy
}

fn lowest(energy: &[f32], pool: &[usize]) -> usize {
    *pool
        .iter()
        .min_by(|a, b| energy[**a].total_cmp(&energy[**b]))
        .expect("non-empty")
}

fn highest(energy: &[f32], pool: &[usize]) -> usize {
    *pool
        .iter()
        .max_by(|a, b| energy[**a].total_cmp(&energy[**b]))
        .expect("non-empty")
}

fn transition_json(from: &TrackAnalysis, to: &TrackAnalysis) -> Value {
    let mut v = json!({
        "energyChange": round2(to.energy() - from.energy()),
        "gapMs": from.tail_silence_ms(),
    });
    if let (Some(a), Some(b)) = (from.dance_bpm(), to.dance_bpm()) {
        v["bpmChange"] = json!(round1(b - a));
    }
    if let (Some(root_a), Some(major_a), Some(root_b), Some(major_b)) =
        (from.key_root, from.key_major, to.key_root, to.key_major)
    {
        v["keysCompatible"] = json!(oximedia_mir::dj_features::CamelotWheel::are_compatible(
            root_a, major_a, root_b, major_b
        ));
    }
    v
}

fn analysis_json(song: &Song, analysis: &TrackAnalysis, include_waveform: bool) -> Value {
    let mut v = json!({
        "id": song.id,
        "title": song.title,
        "artist": song.artist,
        "album": song.album,
        "durationMs": analysis.duration_ms,
        "loudness": {
            "integratedLufs": round1f64(analysis.integrated_lufs),
            "truePeakDbtp": round1f64(20.0 * analysis.true_peak.max(1e-9).log10()),
            "rangeLu": round1f64(analysis.loudness_range),
            "gainToTargetDb": round1f64(analysis.recommended_gain_db),
            "targetLufs": analysis.target_lufs,
        },
        "music": {
            "startMs": analysis.music_start_ms,
            "endMs": analysis.music_end_ms,
            "tailSilenceMs": analysis.tail_silence_ms(),
        },
        "energy": round2(analysis.energy()),
    });
    if let Some(bpm) = analysis.bpm {
        v["tempo"] = json!({
            "bpm": round1(bpm),
            "danceBpm": analysis.dance_bpm().map(round1),
            "confidence": analysis.bpm_confidence.map(round2),
            "stability": analysis.tempo_stability.map(round2),
            "note": "Onset detection can land an octave out; danceBpm folds it to 70–140.",
        });
    }
    if let Some(key) = &analysis.musical_key {
        v["key"] = json!({ "name": key, "camelot": analysis.camelot });
    }
    if include_waveform {
        v["waveform"] = json!(analysis.waveform);
    }
    v
}

fn string_list(args: &Args<'_>, key: &str) -> Result<Vec<String>> {
    let list = args
        .array(key)
        .ok_or_else(|| anyhow!("missing required argument {key:?}"))?;
    Ok(list
        .iter()
        .filter_map(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .collect())
}

// Rounding happens in f64: a rounded f32 still serialises as
// "133.30000305175781", which is noise in every tool result that shows it.
fn round1(value: f32) -> f64 {
    round1f64(value as f64)
}

fn round2(value: f32) -> f64 {
    ((value as f64) * 100.0).round() / 100.0
}

fn round1f64(value: f64) -> f64 {
    (value * 10.0).round() / 10.0
}
