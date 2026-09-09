//! Devices, transport, and the queue.

use anyhow::{anyhow, bail, Result};
use rocksky_sdk::{RemoteQueueItem, RemoteRepeat};
use serde_json::{json, Value};

use super::{device_prop, tool, Args, Ctx, ENQUEUE_SETTLE_MS, SETTLE_MS};
use crate::mcp::state::{device_json, queue_item_json, settle, status_str, Target};
use crate::mcp::subsonic::Song;

/// Removing the whole of a long queue is one command per entry, applied
/// serially by the player; past this many, replacing the queue with an
/// `enqueue` is both faster and kinder to the socket.
const MAX_CLEAR: usize = 100;

pub fn definitions() -> Vec<Value> {
    vec![
        tool(
            "list_devices",
            "List every Rocksky player currently online for this account (playerd daemons, the desktop app, open web miniplayers) with what each is playing. Start here when you do not know which device to command.",
            json!({}),
            &[],
        ),
        tool(
            "get_player_state",
            "What a player is doing right now: transport state, the current track with elapsed position, shuffle/repeat/volume, and the queue.",
            json!({
                "device": device_prop(),
                "include_queue": {
                    "type": "boolean",
                    "description": "Include the full queue (default true). Turn off when you only need the current track.",
                },
            }),
            &[],
        ),
        tool(
            "set_primary_device",
            "Make a device the primary one, so its now-playing drives the public Rocksky profile status.",
            json!({ "device": device_prop() }),
            &["device"],
        ),
        tool(
            "play",
            "Resume playback (or start the cued track).",
            json!({ "device": device_prop() }),
            &[],
        ),
        tool(
            "pause",
            "Pause playback, keeping the position.",
            json!({ "device": device_prop() }),
            &[],
        ),
        tool(
            "next_track",
            "Skip to the next track in the queue.",
            json!({ "device": device_prop() }),
            &[],
        ),
        tool(
            "previous_track",
            "Go back to the previous track in the queue.",
            json!({ "device": device_prop() }),
            &[],
        ),
        tool(
            "seek",
            "Jump to a position within the current track.",
            json!({
                "device": device_prop(),
                "position_ms": { "type": "integer", "minimum": 0, "description": "Position from the start of the track, in milliseconds." },
            }),
            &["position_ms"],
        ),
        tool(
            "set_volume",
            "Set output volume.",
            json!({
                "device": device_prop(),
                "volume": { "type": "number", "minimum": 0, "maximum": 1, "description": "0.0 (silent) to 1.0 (full)." },
            }),
            &["volume"],
        ),
        tool(
            "set_playback_mode",
            "Turn queue shuffle on/off and set the repeat mode. Pass either or both.",
            json!({
                "device": device_prop(),
                "shuffle": { "type": "boolean" },
                "repeat": { "type": "string", "enum": ["off", "one", "all"] },
            }),
            &[],
        ),
        tool(
            "get_queue",
            "The player's queue, with the index of the currently playing entry. Indices are what queue_jump / queue_remove / queue_move take.",
            json!({ "device": device_prop() }),
            &[],
        ),
        tool(
            "enqueue",
            "Put music on a player. Supply tracks (by library id, or just title + artist and they get matched against the library), or an album_id, or a playlist_id. This is how you start a set, add to it, or slip one song in next.",
            json!({
                "device": device_prop(),
                "tracks": {
                    "type": "array",
                    "description": "Tracks to queue, in order. Each entry is either {\"id\": \"<library id from search_library>\"} or {\"title\": \"...\", \"artist\": \"...\"} — names are resolved against the library, and anything with no match is reported back as unresolved instead of failing the call.",
                    "items": {
                        "type": "object",
                        "properties": {
                            "id": { "type": "string", "description": "Library track id (from search_library / get_album / browse_songs)." },
                            "title": { "type": "string" },
                            "artist": { "type": "string" },
                            "album": { "type": "string" },
                        },
                    },
                },
                "album_id": { "type": "string", "description": "Queue a whole album, in track order." },
                "playlist_id": { "type": "string", "description": "Queue a whole playlist, in order." },
                "mode": {
                    "type": "string",
                    "enum": ["now", "next", "last"],
                    "description": "\"now\" replaces the queue and starts playing (default), \"next\" inserts after the current track, \"last\" appends.",
                },
                "shuffle": { "type": "boolean", "description": "Shuffle the batch as it is queued. Only applies to mode \"now\"." },
                "start_index": { "type": "integer", "minimum": 0, "description": "Which entry of the batch to start on, for mode \"now\" (default 0)." },
            }),
            &[],
        ),
        tool(
            "queue_jump",
            "Play a specific position in the queue.",
            json!({
                "device": device_prop(),
                "index": { "type": "integer", "minimum": 0, "description": "Queue position, from get_queue." },
            }),
            &["index"],
        ),
        tool(
            "queue_remove",
            "Drop one entry from the queue.",
            json!({
                "device": device_prop(),
                "index": { "type": "integer", "minimum": 0 },
            }),
            &["index"],
        ),
        tool(
            "queue_move",
            "Reorder the queue by moving one entry to another position.",
            json!({
                "device": device_prop(),
                "from": { "type": "integer", "minimum": 0 },
                "to": { "type": "integer", "minimum": 0 },
            }),
            &["from", "to"],
        ),
        tool(
            "clear_queue",
            "Empty the queue. By default the currently playing track is kept (and keeps playing); pass keep_current false to stop and clear everything.",
            json!({
                "device": device_prop(),
                "keep_current": { "type": "boolean", "description": "Default true." },
            }),
            &[],
        ),
    ]
}

pub async fn call(ctx: &Ctx, name: &str, args: &Args<'_>) -> Result<Option<Value>> {
    let player = &ctx.player;
    let result = match name {
        "list_devices" => {
            player.ready().await;
            let primary = player.primary();
            let devices = player.devices();
            json!({
                "devices": devices
                    .iter()
                    .map(|d| device_json(d, primary.as_deref() == Some(d.id.as_str()), false))
                    .collect::<Vec<_>>(),
                "primaryDevice": primary,
                "hint": if devices.is_empty() {
                    "No players are online. Run `playerd` on the machine that should play, or open the Rocksky web/desktop app."
                } else {
                    "Pass a device name or id as `device` to any command tool."
                },
            })
        }

        "get_player_state" => {
            player.ready().await;
            let target = player.resolve(args.device())?;
            state_of(ctx, &target, args.bool("include_queue").unwrap_or(true))?
        }

        "set_primary_device" => {
            player.ready().await;
            let target = player.resolve(Some(args.req_str("device")?))?;
            let Target::One(id) = &target else {
                bail!("set_primary_device needs one device, not \"all\"");
            };
            player.set_primary(id);
            settle(SETTLE_MS).await;
            json!({ "ok": true, "primaryDevice": id, "device": target.describe(player) })
        }

        "play" | "pause" | "next_track" | "previous_track" => {
            player.ready().await;
            let target = player.resolve(args.device())?;
            match name {
                "play" => player.play(&target),
                "pause" => player.pause(&target),
                "next_track" => player.next(&target),
                _ => player.previous(&target),
            }
            settle(SETTLE_MS).await;
            acted(ctx, &target, name)?
        }

        "seek" => {
            player.ready().await;
            let target = player.resolve(args.device())?;
            let position_ms = args
                .u64("position_ms")
                .ok_or_else(|| anyhow!("missing required argument \"position_ms\""))?;
            player.seek(&target, position_ms);
            settle(SETTLE_MS).await;
            acted(ctx, &target, "seek")?
        }

        "set_volume" => {
            player.ready().await;
            let target = player.resolve(args.device())?;
            let volume = args
                .f32("volume")
                .ok_or_else(|| anyhow!("missing required argument \"volume\""))?;
            if !(0.0..=1.0).contains(&volume) {
                bail!("volume must be between 0.0 and 1.0 (got {volume})");
            }
            player.set_volume(&target, volume);
            settle(SETTLE_MS).await;
            acted(ctx, &target, "set_volume")?
        }

        "set_playback_mode" => {
            player.ready().await;
            let target = player.resolve(args.device())?;
            let shuffle = args.bool("shuffle");
            let repeat = args.str("repeat").map(|mode| match mode {
                "all" => RemoteRepeat::All,
                "one" => RemoteRepeat::One,
                _ => RemoteRepeat::Off,
            });
            if shuffle.is_none() && repeat.is_none() {
                bail!("pass `shuffle`, `repeat`, or both");
            }
            if let Some(shuffle) = shuffle {
                player.set_shuffle(&target, shuffle);
            }
            if let Some(repeat) = repeat {
                player.set_repeat(&target, repeat);
            }
            settle(SETTLE_MS).await;
            acted(ctx, &target, "set_playback_mode")?
        }

        "get_queue" => {
            player.ready().await;
            let target = player.resolve(args.device())?;
            let device = one_device(ctx, &target)?;
            json!({
                "device": device.name,
                "queueIndex": device.queue_index,
                "queueLength": device.queue.len(),
                "queue": device
                    .queue
                    .iter()
                    .enumerate()
                    .map(|(i, item)| queue_item_json(i, item, i as u32 == device.queue_index))
                    .collect::<Vec<_>>(),
            })
        }

        "enqueue" => {
            player.ready().await;
            let target = player.resolve(args.device())?;
            let mode = args.str("mode").unwrap_or("now");
            if !matches!(mode, "now" | "next" | "last") {
                bail!("mode must be \"now\", \"next\" or \"last\" (got {mode:?})");
            }
            let (songs, unresolved, source) = collect_tracks(ctx, args).await?;
            if songs.is_empty() {
                bail!(
                    "nothing to enqueue{}",
                    if unresolved.is_empty() {
                        String::new()
                    } else {
                        format!(" — no library match for: {}", unresolved.join("; "))
                    }
                );
            }
            let shuffle = args.bool("shuffle").unwrap_or(false);
            let start_index = args.u32("start_index").unwrap_or(0);
            let items: Vec<RemoteQueueItem> = songs.iter().map(Song::to_queue_item).collect();
            player.enqueue(&target, items, mode, shuffle, start_index);
            settle(ENQUEUE_SETTLE_MS).await;

            let mut v = json!({
                "ok": true,
                "device": target.describe(player),
                "mode": mode,
                "source": source,
                "enqueued": songs.iter().map(Song::to_json).collect::<Vec<_>>(),
                "state": state_of(ctx, &target, false)?,
            });
            if !unresolved.is_empty() {
                v["unresolved"] = json!(unresolved);
                v["note"] = json!("These had no match in the library and were skipped. Try search_library with a looser query.");
            }
            v
        }

        "queue_jump" | "queue_remove" => {
            player.ready().await;
            let target = player.resolve(args.device())?;
            let index = args.req_u32("index")?;
            if name == "queue_jump" {
                player.queue_jump(&target, index);
            } else {
                player.queue_remove(&target, index);
            }
            settle(SETTLE_MS).await;
            acted(ctx, &target, name)?
        }

        "queue_move" => {
            player.ready().await;
            let target = player.resolve(args.device())?;
            let (from, to) = (args.req_u32("from")?, args.req_u32("to")?);
            player.queue_move(&target, from, to);
            settle(SETTLE_MS).await;
            acted(ctx, &target, "queue_move")?
        }

        "clear_queue" => {
            player.ready().await;
            let target = player.resolve(args.device())?;
            let device = one_device(ctx, &target)?;
            let keep_current = args.bool("keep_current").unwrap_or(true);
            let len = device.queue.len();
            if len > MAX_CLEAR {
                bail!(
                    "queue has {len} entries; clearing more than {MAX_CLEAR} at once is not supported. Use `enqueue` with mode \"now\" to replace the queue outright."
                );
            }
            let current = device.queue_index as usize;
            // High index first: the player renumbers after every removal, so
            // walking down leaves the not-yet-removed positions untouched.
            let mut removed = 0;
            for index in (0..len).rev() {
                if keep_current && index == current {
                    continue;
                }
                player.queue_remove(&target, index as u32);
                removed += 1;
            }
            // A player applies these one at a time, so the readback has to wait
            // for the whole run rather than for a single command.
            settle((removed as u64 * 200).clamp(SETTLE_MS, 20_000)).await;
            json!({
                "ok": true,
                "device": target.describe(player),
                "removed": removed,
                "keptCurrent": keep_current && current < len,
                "state": state_of(ctx, &target, false)?,
            })
        }

        _ => return Ok(None),
    };
    Ok(Some(result))
}

/// Resolve the `tracks` / `album_id` / `playlist_id` forms of `enqueue` into
/// concrete library songs, plus whatever could not be matched.
async fn collect_tracks(ctx: &Ctx, args: &Args<'_>) -> Result<(Vec<Song>, Vec<String>, String)> {
    if let Some(album_id) = args.str("album_id") {
        let (album, songs) = ctx.subsonic().await?.album(album_id).await?;
        return Ok((songs, Vec::new(), format!("album: {}", album.name)));
    }
    if let Some(playlist_id) = args.str("playlist_id") {
        let (playlist, songs) = ctx.subsonic().await?.playlist(playlist_id).await?;
        return Ok((songs, Vec::new(), format!("playlist: {}", playlist.name)));
    }

    let entries = args
        .array("tracks")
        .ok_or_else(|| anyhow!("pass `tracks`, `album_id` or `playlist_id`"))?;
    if entries.is_empty() {
        bail!("`tracks` is empty");
    }
    let subsonic = ctx.subsonic().await?;
    let mut songs = Vec::with_capacity(entries.len());
    let mut unresolved = Vec::new();
    for entry in entries {
        let entry = Args(entry);
        // A caller-supplied id is authoritative; the lookup is only to fill in
        // the metadata controllers display for the queue entry.
        if let Some(id) = entry.str("id") {
            match subsonic.song(id).await {
                Ok(song) => songs.push(song),
                Err(e) => unresolved.push(format!("id {id} ({e})")),
            }
            continue;
        }
        let Some(title) = entry.str("title") else {
            unresolved.push(format!(
                "{entry_json} (needs `id` or `title`)",
                entry_json = entry.0
            ));
            continue;
        };
        let artist = entry.str("artist");
        let label = match artist {
            Some(artist) => format!("{title} — {artist}"),
            None => title.to_string(),
        };
        match subsonic.best_match(title, artist, entry.str("album")).await {
            Ok(Some(song)) => songs.push(song),
            Ok(None) => unresolved.push(label),
            Err(e) => unresolved.push(format!("{label} ({e})")),
        }
    }
    Ok((songs, unresolved, "tracks".to_string()))
}

fn one_device(ctx: &Ctx, target: &Target) -> Result<crate::mcp::state::DeviceState> {
    match target {
        Target::One(id) => ctx
            .player
            .device(id)
            .ok_or_else(|| anyhow!("device {id} is no longer online")),
        Target::All => bail!("this tool needs one device — pass `device`"),
    }
}

/// The state block returned after a command, so the model sees the effect
/// rather than having to poll for it.
fn state_of(ctx: &Ctx, target: &Target, include_queue: bool) -> Result<Value> {
    match target {
        Target::One(id) => {
            let device = ctx
                .player
                .device(id)
                .ok_or_else(|| anyhow!("device {id} is no longer online"))?;
            let primary = ctx.player.primary().as_deref() == Some(id.as_str());
            Ok(device_json(&device, primary, include_queue))
        }
        Target::All => {
            let primary = ctx.player.primary();
            Ok(json!({
                "devices": ctx
                    .player
                    .devices()
                    .iter()
                    .map(|d| device_json(d, primary.as_deref() == Some(d.id.as_str()), false))
                    .collect::<Vec<_>>(),
            }))
        }
    }
}

fn acted(ctx: &Ctx, target: &Target, action: &str) -> Result<Value> {
    let state = state_of(ctx, target, false)?;
    let status = state
        .get("status")
        .and_then(Value::as_str)
        .unwrap_or_else(|| status_str(None))
        .to_string();
    Ok(json!({
        "ok": true,
        "action": action,
        "device": target.describe(&ctx.player),
        "status": status,
        "state": state,
    }))
}
