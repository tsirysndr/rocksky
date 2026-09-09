# playerd

A headless Rocksky remote player. `playerd` registers itself as a playback
device on Rocksky's remote-control WebSocket, shows up in the device picker of
the web and desktop miniplayers, and plays whatever you send to it — uploads,
library tracks, or local files — through the native
[rockbox-playback](https://crates.io/crates/rockbox-playback) engine
(the same decoding/DSP stack as the Rockbox firmware, with
`rockbox-metadata` for tag reading and `rockbox-dsp` under the hood).

Think "Spotify Connect target", but for Rocksky: run it on a headphone rig, a
Raspberry Pi wired to the living-room amp, or a server piping audio into a
socket — then control it from any Rocksky client.

## Contents

- [How it works](#how-it-works)
- [Audio settings from your atproto repo](#audio-settings-from-your-atproto-repo)
- [Install](#install)
- [Building](#building)
- [Authentication](#authentication)
- [Quick start](#quick-start)
- [Configuration](#configuration)
  - [Environment variables](#environment-variables)
  - [CLI](#cli)
- [Audio output](#audio-output)
- [Local playback](#local-playback)
- [What is (and isn't) remotely controllable](#what-is-and-isnt-remotely-controllable)
- [Auto DJ](#auto-dj)
- [AI control: the MCP server](#ai-control-the-mcp-server)
- [The AI DJ guide](AI-DJ.md)
- [Running as a service](#running-as-a-service)
- [Troubleshooting](#troubleshooting)

## How it works

- On start, `playerd` connects to `wss://api.rocksky.app/ws` and registers
  with your access token and a device name. The server assigns it a device id
  and every controller (web miniplayer, desktop app, mobile) sees it in its
  device list.
- Controllers send commands — play, pause, next, previous, seek, queue jump,
  queue remove, enqueue (play now / play next / add to queue, with shuffle and
  start index), shuffle, repeat, volume, and the full DSP surface via
  `audio_settings` (EQ, tone, crossfade, ReplayGain, crossfeed, compressor,
  surround, PBE). `playerd` applies them all to the local engine.
- `playerd` pushes now-playing (title, artist, album, codec, sample rate,
  position), transport state, and the queue back every couple of seconds, so
  the miniplayer stays live.
- The queue and the exact position survive a restart (`resume`, on by default):
  the daemon comes back cued paused where it left off.
- If no other device is primary, the server adopts `playerd` as the primary
  device: its now-playing drives your public profile status. That stream only
  writes the status record, though — scrobbles come from `playerd` itself (see
  `scrobble` below), which submits at half the track or 4 minutes.
- Enqueued tracks resolve to audio like this:
  1. tracks you uploaded to Rocksky stream from
     `https://api.rocksky.app/uploads/<id>/stream` (via a short-lived stream
     token minted from your access token);
  2. library tracks without an upload stream from Navidrome
     (`https://navidrome.rocksky.app`) using Subsonic credentials that
     `playerd` provisions on first use (your handle + a dedicated API key,
     cached in `~/.rocksky/navidrome.json` — shared with the Rocksky CLI).

Reconnects, heartbeats, and re-advertising state after a drop are handled by
the `rocksky-sdk` `remote-player` client.

## Audio settings from your atproto repo

The web and desktop apps persist your DSP settings (equalizer, tone,
crossfade, ReplayGain) to the `app.rocksky.rockbox.audio.settings` record in
your atproto repo. `playerd` fetches that record once on startup and then
listens for record commits on the Jetstream firehose (all four public
servers at once, deduplicated by a shared watermark — the same pattern the
SDK uses for repo hydration), so tweaking the EQ in the web player reaches
the daemon in real time; there is no polling. Only the sections that
actually changed are re-applied — re-pushing an identical EQ would recompute
the filter coefficients and audibly disturb playback. Fields the record
specifies override the local `[equalizer]` baseline; anything it doesn't
specify keeps the TOML value. Set `sync_audio_settings = false` to run
purely from the local config.

You can also load a saved EQ preset (an `app.rocksky.equalizer` record) at
startup with `preset` in the `[equalizer]` section — either an AT URI, or
the name/rkey of one of your own presets:

```toml
[equalizer]
preset = "Bass Boost"                                          # your preset, by name or rkey
# preset = "at://did:plc:xyz/app.rocksky.equalizer/bass-boost" # anyone's, by AT URI
```

The preset's bands and precut replace `enabled`/`bands` below as the EQ
baseline (the EQ is switched on). It is fetched once at startup; if it can't
be resolved, playerd warns and falls back to the TOML bands. Note that with
`sync_audio_settings = true` an equalizer section in the synced record still
wins over the preset — set it to `false` to pin the preset.

## Install

One command — detects your OS and CPU architecture and installs the matching
binary from the [latest playerd release](https://github.com/tsirysndr/rocksky/releases):

```sh
curl -fsSL https://raw.githubusercontent.com/tsirysndr/rocksky/main/playerd/install.sh | sh
```

Or via npm — same binaries, fetched and checksum-verified at install time:

```sh
npm install -g @rocksky/playerd
```

Prebuilt targets: macOS arm64 (Apple Silicon), Linux x86_64 and Linux aarch64.
Anything else (e.g. an Intel Mac) builds from source — see below. On Linux the
binary needs ALSA at runtime (`sudo apt-get install libasound2` on
Debian/Ubuntu).

The script verifies the release's SHA-256 checksum and installs to
`/usr/local/bin` when writable, else `~/.local/bin`. To customize:

```sh
# Pin a version
curl -fsSL https://raw.githubusercontent.com/tsirysndr/rocksky/main/playerd/install.sh \
  | PLAYERD_VERSION=v0.2.0 sh

# Choose the install directory
curl -fsSL https://raw.githubusercontent.com/tsirysndr/rocksky/main/playerd/install.sh \
  | PLAYERD_INSTALL_DIR="$HOME/bin" sh
```

## Building

`playerd` is a standalone crate (it is excluded from the repo's root
workspace because the rockbox crates compile C and use Cargo `links`):

```sh
cd playerd
cargo build --release
# binary at target/release/playerd
```

You need a Rust toolchain and a C compiler (Xcode CLT on macOS,
`build-essential` on Debian/Ubuntu). On Linux, ALSA headers are required for
the default cpal output (`libasound2-dev`).

## Authentication

`playerd` uses your Rocksky access token. In order of precedence:

1. `--token <JWT>` or the `ROCKSKY_TOKEN` environment variable;
2. `token` in the config file;
3. the token file written by `rocksky login`, `~/.rocksky/token.json`
   (path overridable with `token_path` in the config).

If none is found it exits with a hint to run `rocksky login`.

## Quick start

```sh
# Log in once (writes ~/.rocksky/token.json)
rocksky login

# Start the daemon; the device name defaults to your hostname
playerd

# ...or name it explicitly
playerd --name "Living Room"

# ...or queue some local music right away
playerd --name "Living Room" ~/Music/albums/some-album
```

Open Rocksky in the browser or the desktop app, click the device icon in the
miniplayer, pick your player, and hit play on anything.

## Configuration

Configuration merges, in increasing precedence: built-in defaults → the TOML
file → environment variables → CLI flags.

The config file lives at `~/.rocksky/playerd.toml` by default
(`--config`/`PLAYERD_CONFIG` to override; an explicitly given path must
exist, the default one is optional).

Full reference with defaults:

```toml
# Device name shown in the miniplayer picker. Empty = hostname.
name = ""

# Remote-control WebSocket and API endpoints.
ws_url = "wss://api.rocksky.app/ws"
api_url = "https://api.rocksky.app"
navidrome_url = "https://navidrome.rocksky.app"

# Access token. Usually leave both as-is and use `rocksky login`.
# token = "eyJ..."
token_path = "~/.rocksky/token.json"

# Audio output backend, see below. Empty = "cpal".
output = ""

volume = 1.0          # 0.0..=1.0
shuffle = false
repeat = "off"        # off | one | all
buffer_seconds = 10.0 # decode-ahead cushion; keep >= 10 for network streams

# Apply the cross-device audio settings from your atproto repo
# (app.rocksky.rockbox.audio.settings) over the [equalizer] baseline below,
# updated live from the Jetstream firehose so web/desktop EQ tweaks reach
# the daemon in real time (no polling).
sync_audio_settings = true
# Jetstream servers to watch, all connected at once (deduplicated).
# Empty/omitted = the four public Bluesky servers.
# jetstream_urls = ["wss://jetstream1.us-east.bsky.network"]

# Scrobble what this daemon plays to your Rocksky account, at half the track or
# 4 minutes (whichever comes first). On by default — nothing is watching a
# headless player, so there is no UI to make the decision for it.
scrobble = true

# Remember the queue and the exact position, and pick up there on the next
# start — cued PAUSED, never auto-playing. Stream URLs carry a short-lived
# token, so remote tracks are re-resolved from their ids on restore; entries
# that no longer resolve (a deleted upload, a moved local file) are dropped.
# Passing paths on the command line skips the restore.
resume = true
resume_path = "~/.rocksky/playerd-queue.m3u8"  # + a .meta.json sidecar beside it

# Auto DJ: transitions derived from the audio instead of from a stopwatch.
# Can also be turned on live from any controller — see "Auto DJ" below.
[autodj]
enabled = false
overlap_seconds = 6      # music-over-music blend each transition aims for
target_lufs = -14.0      # what the per-track gain recommendation aims at
cache_path = "~/.rocksky/playerd-analysis.db"
cache_entries = 5000     # oldest analyses past this are pruned at startup

# Local DSP baseline; fields present in the synced atproto record win.
[equalizer]
# Saved EQ preset to load at startup: an AT URI to an app.rocksky.equalizer
# record, or the name/rkey of one of your own presets. Replaces
# enabled/bands below as the EQ baseline.
# preset = "at://did:plc:xyz/app.rocksky.equalizer/bass-boost"
# preset = "Bass Boost"
enabled = false
# dB gain for the 10 bands at 32, 64, 125, 250, 500, 1k, 2k, 4k, 8k, 16k Hz.
bands = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
bass = 0              # dB
treble = 0            # dB
# Crossfade: 0 off, 1 auto-skip, 2 manual-skip, 3 shuffle,
# 4 shuffle-or-manual, 5 always. Fade times in seconds.
crossfade = 0
fadeInDelay = 0
fadeInDuration = 2
fadeOutDelay = 0
fadeOutDuration = 2
mixMode = 0           # 0 crossfade, 1 mix
# ReplayGain (read from file tags): 0 track, 1 album, 2 shuffle, 3 off.
replaygain = 3
replaygainPreamp = 0.0
replaygainClip = true # prevent clipping
```

The `[equalizer]` section uses the same keys and units as
`~/.rocksky/settings.toml`, so values can be copied between the two files.

### Environment variables

| Variable                           | Meaning                             |
| ---------------------------------- | ----------------------------------- |
| `PLAYERD_CONFIG`                   | config file path                    |
| `PLAYERD_NAME`                     | device name                         |
| `PLAYERD_WS_URL` (or `ROCKSKY_WS`) | WebSocket URL                       |
| `PLAYERD_API_URL`                  | API base URL                        |
| `PLAYERD_OUTPUT`                   | output backend                      |
| `ROCKSKY_TOKEN`                    | access token                        |
| `RUST_LOG`                         | log filter (default `playerd=info`) |

### CLI

```
playerd [OPTIONS] [PATHS]...
playerd mcp
playerd analyze [--json] <PATHS>...

  PATHS                  audio files or directories to queue and play at startup
  mcp                    run an MCP server on stdio instead of a player
  analyze                analyse local files (loudness, edges, tempo, key) and
                         print the result, warming the Auto DJ cache
  -c, --config <PATH>    TOML config file
  -n, --name <NAME>      device name shown in the miniplayer picker
      --ws-url <URL>     remote-control WebSocket URL
      --api-url <URL>    Rocksky API base URL
      --token <JWT>      access token
  -o, --output <SPEC>    audio output backend
```

## Audio output

The `output` setting (or `-o`/`PLAYERD_OUTPUT`) selects where decoded audio
goes:

| Spec                           | Behavior                                            |
| ------------------------------ | --------------------------------------------------- |
| `cpal`                         | the system's default audio device (default)         |
| `stdout`                       | raw interleaved S16LE stereo PCM on stdout          |
| `fifo:/path/to/pipe`           | write PCM into an existing FIFO (`mkfifo` it first) |
| `unix:/path/to.sock`           | Unix socket                                         |
| `tcp:HOST:PORT` or `tcp::PORT` | TCP socket                                          |

Socket backends listen and **block startup until a client connects**. Example
— pipe into ffmpeg:

```sh
playerd -o stdout | ffmpeg -f s16le -ar 44100 -ac 2 -i - ...
```

## Local playback

Positional paths are scanned (directories recursively), filtered to formats
the rockbox codecs understand, tagged via `rockbox-metadata`, queued, and
played. The queue — including titles, artists, and durations from the file
tags — is visible and controllable from any Rocksky client, and album art +
likes are enriched server-side.

## What is (and isn't) remotely controllable

Supported remote commands: play, pause, next, previous, seek, jump to a queue
position, remove from queue, move within the queue, enqueue (now / next / last,
with shuffle and start index — this is what the miniplayer's "play on device"
does for songs, albums, and playlists), shuffle, repeat, volume, and the DSP
surface via `audio_settings`. The `volume`, `shuffle` and `repeat` config keys
are the *startup* values for those; the live setting is whatever a controller
last sent, and it survives a restart alongside the queue.

What stays startup-only is everything the protocol has no command for: the
output backend, `buffer_seconds`, `resume`, `scrobble` and
`sync_audio_settings`. Changing those means editing `playerd.toml` and
restarting the daemon.

## Auto DJ

Most players crossfade on a stopwatch: blend the last N seconds of one track
into the first N of the next, whatever is in them. On real records that is
often two seconds of room tone fading into a second of silence — the
"crossfade" you hear is the gap.

Auto DJ analyses both sides of the transition and programs the engine so the
fade lands on the music: the outgoing ramp finishes where the last note does,
and the incoming track's own lead-in is spent inside the blend instead of
after it.

```sh
# in ~/.rocksky/playerd.toml
[autodj]
enabled = true
overlap_seconds = 6
```

…or turn it on live from any controller — it is a crossfade mode, so it rides
the existing `audio_settings` command:

```json
{ "type": "command", "action": "audio_settings",
  "args": { "crossfade": { "mode": "auto", "fadeOutDuration": 6000 } } }
```

From an agent, that is `set_auto_dj` (see below). A player that predates Auto
DJ reads `"auto"` as an unknown mode, falls back to "off", and keeps playing.

### The analysis

One decode pass per track, cached in SQLite
(`~/.rocksky/playerd-analysis.db`) so a track is only ever analysed once:

|                 |                                                                                                                                                                                |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Loudness**    | EBU R128 integrated LUFS, true peak, loudness range, and the gain that would bring the track to `target_lufs` without clipping ([`ebur128`](https://crates.io/crates/ebur128)) |
| **Edges**       | where the music actually starts and ends — what makes a transition land on music instead of silence                                                                            |
| **Shape**       | a 200-bin peak waveform                                                                                                                                                        |
| **Tempo & key** | BPM with confidence and stability, musical key and its Camelot code, for beat- and harmonic-matching ([`oximedia-mir`](https://crates.io/crates/oximedia-mir))                 |
| **Energy**      | a 0–1 figure derived from loudness, tempo and dynamic range, for sequencing a set                                                                                              |

Decoding for analysis uses [symphonia](https://crates.io/crates/symphonia)
rather than the rockbox codecs the player itself uses: those keep global codec
state behind a process-wide gate, so analysing the *next* track would block
until the *current* one finished playing. The trade-off is that a few exotic
AAC profiles symphonia cannot decode ("aac too complex") get no analysis, and
their transitions fall back to a plain crossfade.

Inspect it yourself — this also warms the cache, so an album analysed up front
has nothing left to compute when it plays:

```sh
playerd analyze ~/Music/some-album          # summary per track
playerd analyze --json track.flac           # the whole document
```

```
01 - Radiohead - You.m4a
  -14.5 LUFS  peak -0.94 dBTP  gain -0.1 dB  (2 ch @ 22050 Hz, 3:28)
  music 0:01 → 3:26  (lead-in 1180 ms, tail 2613 ms)
  149.0 BPM (89% confident)  key E minor (9A)  energy 0.39  range 5.9 LU
```

### How the fade is programmed

Rockbox anchors the crossfade region to the **end of the outgoing file**: the
region is `max(out_delay + out_duration, in_delay + in_duration)` long, and the
outgoing ramp finishes `out_delay + out_duration` into it. So with `trailing`
for the outgoing silent tail, `lead` for the incoming silent head and `overlap`
for the blend you asked for:

```
out_delay    = 0                             the outgoing ramp runs for the
out_duration = overlap                       last `overlap` of actual music

in_delay     = lead                          the incoming fade starts when
in_duration  = overlap + trailing − lead     its music does

⇒ region − (out_delay + out_duration) = trailing
  — the ramp ends exactly where the music ends.
```

## AI control: the MCP server

`playerd mcp` runs a [Model Context Protocol](https://modelcontextprotocol.io)
server on stdio, so Claude, Codex, Copilot and anything else that speaks MCP can
drive playback: pick a device, search the library, build a queue, skip, seek,
set the volume, tune the EQ.

It is a **controller**, not a player. It registers on the same remote-control
WebSocket as the web and desktop miniplayers and commands *every* device on the
account, so the agent can run on a laptop and start music on the amp in the
living room. It needs the same access token as the daemon (`rocksky login`, or
`ROCKSKY_TOKEN`) and no audio hardware of its own.

Register it once:

```sh
# Claude Code
claude mcp add rocksky-player -- playerd mcp
```

```jsonc
// Claude Desktop (claude_desktop_config.json); VS Code / Copilot use
// .vscode/mcp.json with "servers" and "type": "stdio"
{ "mcpServers": { "rocksky-player": { "command": "playerd", "args": ["mcp"] } } }
```

```toml
# Codex (~/.codex/config.toml)
[mcp_servers.rocksky-player]
command = "playerd"
args = ["mcp"]
```

The 35 tools cover the whole live surface:

| Group     | Tools                                                                                                                         |
| --------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Devices   | `list_devices`, `get_player_state`, `set_primary_device`                                                                      |
| Transport | `play`, `pause`, `next_track`, `previous_track`, `seek`, `set_volume`, `set_playback_mode`                                    |
| Queue     | `get_queue`, `enqueue`, `queue_jump`, `queue_remove`, `queue_move`, `clear_queue`                                             |
| Library   | `search_library`, `get_album`, `get_artist`, `browse_songs`, `browse_albums`, `list_genres`, `list_playlists`, `get_playlist` |
| Taste     | `whoami`, `get_recommendations`, `get_listening_history`                                                                      |
| Sound     | `get_audio_settings`, `set_equalizer`, `set_audio_settings`, `list_equalizer_presets`, `apply_equalizer_preset`               |
| Auto DJ   | `set_auto_dj`, `analyze_tracks`, `plan_set`                                                                                   |

Library lookups return an `id` on every track, and that id is what `enqueue`
takes. Recommendations and listening history come back as names instead, so
`enqueue` accepts plain `{title, artist}` entries too and matches them against
the library itself — which is what makes an **AI DJ** one call rather than a
resolution loop:

```
"read what I've been listening to, build a 10-track set for cooking dinner,
 and queue it on the Living Room without interrupting what's on"
```

`plan_set` takes that further: it analyses the candidates and orders them so
tempo, key and energy move sensibly instead of lurching — a greedy walk over a
transition cost of BPM stretch, Camelot compatibility and energy step, shaped
by `smooth` / `build` / `wind_down` / `arc`. It hands back ordered ids for
`enqueue`, plus what each transition will do:

```
0. Bullet Proof ... I Wish I  bpm  79.1  key 9B  energy 0.45
1. Black Star                 bpm  79.1  key 9B  energy 0.59   Δbpm 0.0   keys OK
2. My Iron Lung               bpm  97.4  key 9B  energy 0.62   Δbpm 18.3  keys OK
3. Sulk                       bpm  97.4  key 10B energy 0.67   Δbpm 0.0   keys OK
```

Pair it with `set_auto_dj` and the agent picks the records while the player
handles the mix.

Startup-only settings — the output backend, `buffer_seconds`, `resume`,
`scrobble`, `sync_audio_settings` — stay in `playerd.toml`; they are not
remotely controllable and the MCP server does not expose them.

### Prompts, examples, and what to expect

[**AI-DJ.md**](AI-DJ.md) is the guide: setup for every client, prompts that
work well, and real output for each one — planned sets, analysis, transitions —
plus an honest list of what it cannot do.

### The DJ skill

`skills/rocksky-dj/` is an agent skill teaching the craft on top of the tools:
device etiquette, how to sequence a set rather than dump a playlist, when `now`
is rude and `last` is right, and how to install all of this from scratch.

```sh
cp -r playerd/skills/rocksky-dj ~/.claude/skills/
```

## Running as a service

systemd unit example (`~/.config/systemd/user/playerd.service`):

```ini
[Unit]
Description=Rocksky remote player
After=network-online.target sound.target

[Service]
ExecStart=%h/.local/bin/playerd --name "Living Room"
Restart=on-failure
RestartSec=3

[Install]
WantedBy=default.target
```

```sh
systemctl --user enable --now playerd
```

## Troubleshooting

- **"audio engine: NoOutputDevice"** — no usable output device for cpal; on
  a headless box either fix ALSA/PipeWire or use a `stdout`/`fifo`/socket
  output.
- **"no access token: run `rocksky login` first"** — authenticate, or pass
  `--token`/`ROCKSKY_TOKEN`.
- **Device not in the picker** — devices appear once they have pushed state;
  give it a couple of seconds after "registered as device …" shows in the
  log. Also make sure the controller is logged in to the *same* Rocksky
  account: devices are per-user.
- **"enqueue: track is not streamable, skipping"** — the track has neither
  an upload id nor a resolvable Navidrome id, or credential provisioning
  failed (check the log for `navidrome credentials unavailable`).
- **Choppy start on remote tracks** — raise `buffer_seconds`.
- **"aac too complex" from `analyze`** — symphonia cannot decode that AAC
  profile, so the track gets no analysis and its transitions fall back to a
  plain crossfade. Everything else about playback is unaffected.
- **Auto DJ transitions sound ordinary at first** — the analysis of a newly
  queued pair runs in the background; the transition after it is shaped.
  `RUST_LOG=playerd=debug` logs each one it programs.
- Verbose logs: `RUST_LOG=playerd=debug,rocksky_sdk=debug playerd` (all logs go
  to stderr, so `-o stdout` stays pure PCM).
