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

## How it works

- On start, `playerd` connects to `wss://api.rocksky.app/ws` and registers
  with your access token and a device name. The server assigns it a device id
  and every controller (web miniplayer, desktop app, mobile) sees it in its
  device list.
- Controllers send commands — play, pause, next, previous, seek, queue jump,
  queue remove, and enqueue (play now / play next / add to queue, with
  shuffle and start index). `playerd` applies them to the local engine.
- `playerd` pushes now-playing (title, artist, album, codec, sample rate,
  position), transport state, and the queue back every couple of seconds, so
  the miniplayer stays live.
- If no other device is primary, the server adopts `playerd` as the primary
  device: its now-playing drives your public profile status and **scrobbles
  are recorded server-side** — no extra scrobbler needed.
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

[equalizer]
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

| Variable | Meaning |
|---|---|
| `PLAYERD_CONFIG` | config file path |
| `PLAYERD_NAME` | device name |
| `PLAYERD_WS_URL` (or `ROCKSKY_WS`) | WebSocket URL |
| `PLAYERD_API_URL` | API base URL |
| `PLAYERD_OUTPUT` | output backend |
| `ROCKSKY_TOKEN` | access token |
| `RUST_LOG` | log filter (default `playerd=info`) |

### CLI

```
playerd [OPTIONS] [PATHS]...

  PATHS                  audio files or directories to queue and play at startup
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

| Spec | Behavior |
|---|---|
| `cpal` | the system's default audio device (default) |
| `stdout` | raw interleaved S16LE stereo PCM on stdout |
| `fifo:/path/to/pipe` | write PCM into an existing FIFO (`mkfifo` it first) |
| `unix:/path/to.sock` | Unix socket |
| `tcp:HOST:PORT` or `tcp::PORT` | TCP socket |

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

Supported remote commands: play, pause, next, previous, seek, jump to a
queue position, remove from queue, and enqueue (now / next / last, with
shuffle and start index — this is what the miniplayer's "play on device"
does for songs, albums, and playlists).

The Rocksky remote protocol has no volume, shuffle-toggle, or repeat
commands (no client sends them today), so those are startup configuration
(`volume`, `shuffle`, `repeat`) rather than live controls.

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
- Verbose logs: `RUST_LOG=playerd=debug,rocksky_sdk=debug playerd`.
