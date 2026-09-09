---
name: rocksky-dj
description: Play and DJ real music on Rocksky players (playerd daemons, the desktop app, web miniplayers) through the playerd MCP server. Use when asked to put music on, play an album or artist, build or extend a queue, DJ a set for a mood or an occasion, mix tracks with beat- and key-aware transitions (Auto DJ), analyse what a track sounds like (tempo, key, loudness, energy), skip/pause/seek, change volume, shuffle or repeat, adjust the equalizer or crossfade, or answer "what's playing?". Also covers installing playerd and registering its MCP server when the tools are not available yet.
---

# Rocksky DJ

Drive real playback on real speakers. The `playerd mcp` server is a *controller*
on Rocksky's remote-control protocol — the same one the web and desktop
miniplayers speak — so it commands every player on the account, wherever they
run, and anything it does is visible in those apps too.

Music is loud, in someone's room. Before replacing what is already playing, say
what you are about to do, or add to the queue instead.

## Check the tools are there first

If tools like `list_devices`, `enqueue` and `search_library` are available, skip
to [Getting oriented](#getting-oriented). Otherwise set it up:

**1. Install playerd** — one binary, no runtime:

```sh
# macOS arm64, Linux x86_64/aarch64 — detects OS and CPU
curl -fsSL https://raw.githubusercontent.com/tsirysndr/rocksky/main/playerd/install.sh | sh

# or via npm (same binaries, checksum-verified)
npm install -g @rocksky/playerd

# or from source (needs Rust + a C compiler; ALSA headers on Linux)
git clone https://tangled.org/@rocksky.app/rocksky && cd rocksky/playerd
cargo build --release   # binary at target/release/playerd
```

**2. Log in.** playerd reads the token `rocksky login` writes to
`~/.rocksky/token.json`:

```sh
npm install -g @rocksky/cli   # if needed
rocksky login <handle>.bsky.social
```

`ROCKSKY_TOKEN=<jwt>` in the environment works instead.

**3. Register the MCP server** with the agent, then restart it:

```sh
# Claude Code
claude mcp add rocksky-player -- playerd mcp
```

```jsonc
// Claude Desktop — claude_desktop_config.json
// VS Code / GitHub Copilot — .vscode/mcp.json uses "servers" and needs "type": "stdio"
{ "mcpServers": { "rocksky-player": { "command": "playerd", "args": ["mcp"] } } }
```

```toml
# Codex — ~/.codex/config.toml
[mcp_servers.rocksky-player]
command = "playerd"
args = ["mcp"]
```

**4. Have something to play on.** The MCP server controls devices; it is not
one. An open Rocksky web/desktop app already counts. For a headless player —
a Pi on the amp, a server, a headphone rig — run the daemon there:

```sh
playerd --name "Living Room"      # add --output stdout|fifo:PATH|tcp:HOST:PORT for odd rigs
```

It survives restarts (queue and position resume, cued paused) and scrobbles
what it plays.

## Getting oriented

`list_devices` first, every session: it names the players that are online and
shows what each is doing. Every command tool takes an optional `device` — an id
or a name, partial and case-insensitive ("living" finds "Living Room"). Omit it
when there is only one player and it is picked for you; pass `"all"` to
broadcast.

`get_player_state` is the "what is happening" call: transport, current track
with elapsed position, shuffle/repeat/volume, and the queue.

## Playing something

Two kinds of things get queued, and knowing which you have saves a round trip:

- **Library results carry an `id`** — `search_library`, `browse_songs`,
  `get_album`, `get_playlist`, `get_artist`. Pass those ids to `enqueue`.
- **Taste results carry only names** — `get_recommendations`,
  `get_listening_history`. Pass them to `enqueue` as `{title, artist}` and it
  matches them against the library itself, reporting anything it could not
  place under `unresolved` rather than failing the call.

`enqueue` also takes `album_id` or `playlist_id` to queue a whole album or
playlist in order.

Modes matter:

| mode   | effect                                                         |
| ------ | -------------------------------------------------------------- |
| `now`  | replaces the queue and starts playing — takes over the room    |
| `next` | inserts after the current track — the classic "play this next" |
| `last` | appends — extends a set without interrupting it                |

Default to `last` or `next` when something is already playing. Use `now` when
the listener asked for a change of direction, and say so.

Only music in the listener's Rocksky library can be played — their uploads plus
everything Rocksky has indexed for them. There is no external catalogue. If a
requested artist is not there, say so and offer what is.

## DJing a set

A request like "put on something for cooking dinner" is a brief, not a search.

1. **Read the room.** `get_player_state` for what is playing now (a set that
   ignores the current track lands badly), then `get_listening_history`
   (`top` / `loved` / `recent`) for what this listener actually likes.
2. **Source candidates.** `get_recommendations` for adjacency,
   `browse_songs` with `kind: "random"` and a `genre` or year range for
   variety, `search_library` for specific artists, `get_album` when an album
   deserves to be heard whole.
3. **Sequence it.** 8–15 tracks is a set; more is a shift nobody asked for.
   Open near where the room already is, build, and give it an end. Do not put
   two tracks by the same artist back to back unless it is deliberate.
4. **Queue it** in one `enqueue` call — order is preserved, so the sequence you
   chose is the sequence that plays. Do not pass `shuffle: true` after
   sequencing deliberately; it throws the order away.
5. **Confirm.** `get_player_state` afterwards, and tell the listener what is on
   and what follows.

While a set runs: `next_track` to drop a track, `queue_remove` to pull one that
has not played yet, `queue_move` to reorder, `enqueue` with `next` to slot in a
request, `clear_queue` (keeps the current track by default) to start over.

## Mixing it properly

Three tools turn a playlist into a set. They cost real time on first use — the
player downloads and decodes each track once — so reach for them when the
listener asked for a *set*, not when they asked for one song.

**`set_auto_dj`** hands the transitions to the player. It analyses what is
playing and what is next and fades out where the music ends rather than
through the silence after it. Turn it on for anything continuous — a party, a
dinner, a work session — and leave it off for albums meant to be heard with
their gaps, or spoken word.

```
set_auto_dj { device: "Living Room", enabled: true, overlap_seconds: 6 }
```

Long overlaps (8–12 s) suit dance music; 3–4 s suits songs; off suits an album
that was sequenced deliberately.

**`plan_set`** orders candidates so the set flows. Hand it more tracks than you
need — 20 candidates for a 10-track set — and it analyses each, then sequences
them by tempo, key and energy:

- `smooth` (default) — every transition as easy as possible
- `build` — energy rises through the set
- `wind_down` — energy falls
- `arc` — builds to a peak two-thirds in, then comes down

It returns `trackIds` in order. Pass them straight to `enqueue` (order is
preserved) and **do not** also pass `shuffle` — that throws the sequencing
away. Each step also reports what the transition does (`bpmChange`,
`keysCompatible`, `energyChange`), which is what to quote when explaining a
set.

**`analyze_tracks`** answers "what is this actually like?" — loudness, where
the music starts and ends, tempo, key, dynamic range, energy. Use it to answer
questions ("is this album mastered loud?", "what BPM is this?") or to pick by
feel rather than by genre tag. `cached_only: true` gives instant answers for
tracks already analysed and skips the download for the rest.

A full DJ pass looks like this:

1. `get_listening_history` and `get_recommendations` for material
2. `search_library` / `browse_songs` to turn names into ids
3. `plan_set` with a shape and a length
4. `enqueue` the returned `trackIds`
5. `set_auto_dj` so the transitions match the sequencing

Caveats worth knowing: BPM detection can land an octave out, so compare
`danceBpm` (folded to 70–140) rather than raw `bpm`; a few AAC files cannot be
decoded for analysis and are reported under `unavailable`; and analysis of a
track the player has never seen takes a second or two, so a first `plan_set`
over 20 unseen tracks is not instant.

## Sound

`set_equalizer` takes ten dB gains for 32, 64, 125, 250, 500, 1k, 2k, 4k, 8k and
16k Hz. Keep within ±12 dB, and set `precut_db` near your largest positive gain
so it does not clip. `apply_equalizer_preset` loads one the listener saved;
`list_equalizer_presets` shows them.

`set_audio_settings` reaches the rest of the chain — crossfade, ReplayGain,
crossfeed, compressor, surround, PBE — with only the sections you pass applied.
Crossfade is what makes a set flow:

```json
{ "crossfade": { "mode": "enabled", "fadeOutDuration": 4000, "fadeInDuration": 4000 } }
```

These apply to the running player and do **not** rewrite the listener's saved
settings (`get_audio_settings` shows those, and the next change made in the web
or desktop app wins again). Volume is `set_volume`, 0.0–1.0 — move it in small
steps and never to 1.0 unprompted.

## Tools at a glance

- **Devices** — `list_devices`, `get_player_state`, `set_primary_device`
- **Transport** — `play`, `pause`, `next_track`, `previous_track`, `seek`,
  `set_volume`, `set_playback_mode` (shuffle/repeat)
- **Queue** — `get_queue`, `enqueue`, `queue_jump`, `queue_remove`,
  `queue_move`, `clear_queue`
- **Library** — `search_library`, `get_album`, `get_artist`, `browse_songs`,
  `browse_albums`, `list_genres`, `list_playlists`, `get_playlist`
- **Taste** — `whoami`, `get_recommendations`, `get_listening_history`
- **Sound** — `get_audio_settings`, `set_equalizer`, `set_audio_settings`,
  `list_equalizer_presets`, `apply_equalizer_preset`
- **Mixing** — `set_auto_dj`, `plan_set`, `analyze_tracks`

## More

The [AI DJ guide](https://github.com/tsirysndr/rocksky/blob/main/playerd/AI-DJ.md)
has worked examples for every one of these tools, with real output.

## When something is off

- **"no players are online"** — nothing is running. Start `playerd`, or have the
  listener open the Rocksky app. Devices appear a second or two after they first
  push state.
- **"several players are online — pass `device`"** — name one, or ask which.
- **A track was skipped as unresolved** — it is not in this library. Try
  `search_library` with just the title, or pick something else.
- **Commands do nothing** — check `get_player_state`: a player that has gone
  offline still lingers briefly in the device list.
- **Auth failures** — the access token expired; `rocksky login` again.
- **A track shows up as `unavailable` from analysis** — some AAC files cannot
  be decoded for analysis. It still plays; only its transition falls back to a
  plain crossfade.
- **Nothing audible on a headless box** — playerd logs `NoOutputDevice` when
  ALSA/PipeWire has no usable sink; it needs `--output` pointed somewhere real.
  That is a shell fix on that machine, not something these tools can do.
