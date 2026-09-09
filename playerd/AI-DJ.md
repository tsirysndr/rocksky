# The Rocksky AI DJ

Describe the music you want. Get it playing, in the right order, mixed.

`playerd mcp` puts your whole listening setup behind a [Model Context
Protocol](https://modelcontextprotocol.io) server — every player on your
account, your library, your listening history, and an audio analyser that
knows what your records actually sound like. Point Claude, Codex or Copilot at
it and you can talk to your stereo.

Everything on this page is real output from a real library, not a mock-up.

## Contents

- [Setup in three commands](#setup-in-three-commands)
- [The first five minutes](#the-first-five-minutes)
- [Prompts that work well](#prompts-that-work-well)
  - [Just play something](#just-play-something)
  - [Build me a set](#build-me-a-set)
  - [Shape the set](#shape-the-set)
  - [Mix it properly](#mix-it-properly)
  - [Ask about the music](#ask-about-the-music)
  - [Tune the sound](#tune-the-sound)
  - [Run the room](#run-the-room)
- [How a brief becomes a mix](#how-a-brief-becomes-a-mix)
- [What it can't do](#what-it-cant-do)
- [The tools underneath](#the-tools-underneath)

## Setup in three commands

```sh
# 1. install the daemon (macOS arm64, Linux x86_64/aarch64)
curl -fsSL https://raw.githubusercontent.com/tsirysndr/rocksky/main/playerd/install.sh | sh

# 2. log in once
rocksky login <handle>.bsky.social

# 3. register the MCP server with your agent
claude mcp add rocksky-player -- playerd mcp
```

<details>
<summary>Claude Desktop, Codex, VS Code / Copilot</summary>

```jsonc
// Claude Desktop — claude_desktop_config.json
{ "mcpServers": { "rocksky-player": { "command": "playerd", "args": ["mcp"] } } }
```

```jsonc
// VS Code / GitHub Copilot — .vscode/mcp.json
{ "servers": { "rocksky-player": { "type": "stdio", "command": "playerd", "args": ["mcp"] } } }
```

```toml
# Codex — ~/.codex/config.toml
[mcp_servers.rocksky-player]
command = "playerd"
args = ["mcp"]
```

</details>

The MCP server controls players; it isn't one. An open Rocksky web or desktop
app already counts as a player. For a headless rig — a Pi on the amp, a server,
a headphone box — run the daemon there:

```sh
playerd --name "Living Room"
```

Also worth installing: the [`rocksky-dj` skill](skills/rocksky-dj/SKILL.md),
which teaches the agent the craft on top of the tools (when to extend a queue
rather than replace it, how long an overlap suits which music, how to sequence
a set).

```sh
cp -r playerd/skills/rocksky-dj ~/.claude/skills/
```

## The first five minutes

> **"what's playing?"**

```json
{
  "name": "Orange Pi Zero 3W",
  "status": "playing",
  "nowPlaying": {
    "title": "Good Vibrations",
    "artist": "Tensnake, Bobby Harvey, Sarah Bird",
    "album": "Free",
    "position": "1:33 / 3:07",
    "codec": "aac", "sampleRate": 44100,
    "shuffle": false, "repeat": "off", "volume": 0.09
  }
}
```

> **"which players are online?"**

```
Music Player       playing   A Perfect Circle — The Doomed        (primary)
Orange Pi Zero 3W  paused    Tensnake — Good Vibrations
```

Every command takes an optional device, by name and partially — "living" finds
"Living Room". With one player online you never have to say which.

## Prompts that work well

### Just play something

> **"play The Bends"**
> **"put on some Radiohead"**
> **"play this album next, don't interrupt what's on"**
> **"skip this"** · **"back 30 seconds"** · **"turn it down a bit"**
> **"what album is this from?"**

Anything in your library — your uploads plus everything Rocksky has indexed
for you. There is no external catalogue, so if an artist isn't yours, the agent
will say so and offer what is.

### Build me a set

> **"build a 10-track set for cooking dinner from what I've been listening to"**

The agent reads your history and recommendations, finds the tracks in your
library, sequences them and queues them. A real recommendation call on this
library returned:

```json
{ "title": "Even Flow", "artist": "Pearl Jam",
  "genres": ["grunge", "rock"], "score": 2.094, "source": "known-artist" }
```

Those come back as *names*, not ids — and `enqueue` accepts names directly,
matching them against your library and reporting anything it couldn't place.
So a recommendation goes straight to the speakers with no lookup dance.

### Shape the set

This is where it stops being a playlist. `plan_set` analyses the candidates and
orders them by measured tempo, key and energy. Same eleven starred tracks,
three different briefs:

> **"start mellow and build"**

```
1. Tides                          99.4 bpm  10B  energy 0.47
2. Bottle And A Bible             94.4 bpm   9B  energy 0.67   bpm  -5.0  keys ok
3. Freefall (feat. Oliver Tree)  126.6 bpm  10B  energy 0.85   bpm +32.2  keys ok
4. Hurting                       115.1 bpm  11B  energy 0.79   bpm -11.5  keys ok
5. Honest                         87.7 bpm  11B  energy 0.59   bpm -27.4  keys ok
6. COUNTERFEIT                    89.1 bpm   7A  energy 0.65   bpm  +1.4  keys --
7. Fever Dreamer                 126.6 bpm   7B  energy 0.76   bpm +37.5  keys ok
8. Lifetime                      116.9 bpm   5A  energy 0.74   bpm  -9.7  keys --
```

> **"wind it down over six tracks"**

```
1. Freefall (feat. Oliver Tree)  126.6 bpm  10B  energy 0.85
2. Hurting                       115.1 bpm  11B  energy 0.79   bpm -11.5  keys ok
3. Tides                          99.4 bpm  10B  energy 0.47   bpm -15.7  keys ok
4. Bottle And A Bible             94.4 bpm   9B  energy 0.67   bpm  -5.0  keys ok
5. Honest                         87.7 bpm  11B  energy 0.59   bpm  -6.7  keys --
6. COUNTERFEIT                    89.1 bpm   7A  energy 0.65   bpm  +1.4  keys --
```

126 → 87 BPM, energy 0.85 → 0.65, and every one of those key moves is a legal
Camelot step.

> **"build to a peak and bring it back down"**

```
1. Tides                          99.4 bpm  10B  energy 0.47
2. Bottle And A Bible             94.4 bpm   9B  energy 0.67   bpm  -5.0  keys ok
3. COUNTERFEIT                    89.1 bpm   7A  energy 0.65   bpm  -5.3  keys --
4. Fever Dreamer                 126.6 bpm   7B  energy 0.76   bpm +37.5  keys ok
5. WAY DOWN LOW                  133.3 bpm   4A  energy 0.85   bpm  +6.7  keys --
6. Lifetime                      116.9 bpm  5A   energy 0.74   bpm -16.4  keys ok
7. Honest                         87.7 bpm  11B  energy 0.59   bpm -29.2  keys --
```

Four shapes: `smooth` (every join as easy as possible — the default),
`build`, `wind_down`, `arc`. Ask for them in words; the agent picks the flag.

Give it more candidates than you need — twenty for an eight-track set — and it
has room to satisfy both the shape and the joins. With a small pool it will
trade one against the other, as the `+32.2` above shows.

### Mix it properly

> **"turn on auto dj with an eight second blend"**

Most players crossfade on a stopwatch: the last N seconds of one track into the
first N of the next, whatever is in them. On real records that is often room
tone fading into silence — the "crossfade" you hear is the gap.

Auto DJ analyses both sides and puts the fade on the music:

```
auto dj: programmed the next transition
  out_ms=6000  in_delay_ms=400  in_ms=8910  tail_ms=3310  lead_ms=400
```

That transition is real. *Street Spirit* ends on 3.31 s of silence; *Sulk*
opens with 0.4 s of it. A plain 6 s crossfade would spend more than half its
blend on nothing. Auto DJ stretched the region to 9.31 s so the outgoing ramp
finishes exactly on the last note and the incoming track's lead-in is spent
inside the overlap.

Rules of thumb the agent already knows: 8–12 s for continuous dance music, 3–4 s
for songs, off for an album meant to be heard with its gaps.

### Ask about the music

> **"is this album mastered loud?"**

```
Street Spirit (Fade Out)  -11.3 LUFS  range  4.7 LU  133 bpm  8A   energy 0.80  tail 3310ms
Sulk                       -9.5 LUFS  range  4.3 LU   97 bpm  10B  energy 0.67  tail 3727ms
Black Star                 -9.2 LUFS  range  4.2 LU   79 bpm  9B   energy 0.59  tail 2106ms
Bullet Proof ... I Wish I -11.1 LUFS  range  9.5 LU   79 bpm  9B   energy 0.45  tail 2773ms
My Iron Lung              -10.7 LUFS  range  5.3 LU   97 bpm  9B   energy 0.62  tail 1340ms
Just                       -9.3 LUFS  range  4.1 LU   84 bpm  8A   energy 0.62  tail 1506ms
```

Yes — around -9 LUFS with 4 LU of range. *Bullet Proof* is the outlier at 9.5
LU, which is what a track with quiet verses and a loud chorus looks like.

> **"what BPM is this?"** · **"what key is it in?"** · **"which of my loved
> tracks are the quietest?"** · **"is anything in this playlist clipping?"**

Same analysis, asked different ways. It also runs from the shell without an
agent:

```sh
$ playerd analyze "~/Music/Pablo Honey/01 - Radiohead - You.m4a"
  -14.5 LUFS  peak -0.94 dBTP  gain -0.1 dB  (2 ch @ 22050 Hz, 3:28)
  music 0:01 → 3:26  (lead-in 1180 ms, tail 2613 ms)
  149.0 BPM (89% confident)  key E minor (9A)  energy 0.39  range 5.9 LU
```

### Tune the sound

> **"boost the bass a bit"** · **"flatten the EQ"** · **"load my Bass Boost preset"**
> **"turn on ReplayGain so the volume stops jumping around"**
> **"add a four second crossfade"**

The whole rockbox DSP chain is reachable: 10-band EQ, tone, crossfade,
ReplayGain, crossfeed, compressor, surround, PBE. These apply to the running
player and leave your saved settings alone.

### Run the room

> **"play this on the Orange Pi instead"**
> **"pause everything"** (`device: "all"` broadcasts)
> **"what's in the queue?"** · **"drop track 4"** · **"move that one to the top"**
> **"clear the queue but keep what's playing"**
> **"make the living room the primary device"** (drives your public profile)

## How a brief becomes a mix

> **"put on a late-night electronic set from my loved tracks — start mellow,
> build to something driving, about 8 tracks, mix it properly on the Orange Pi"**

Four parties, each doing what it's good at:

| Step      | Who            | What happens                                                                |
| --------- | -------------- | --------------------------------------------------------------------------- |
| Interpret | the model      | "late-night electronic" → keep SG Lewis, Whethan, Elley Duhé; drop the rock |
| Find      | `browse_songs` | loved tracks come back with the ids that make them playable                 |
| Sequence  | `plan_set`     | analyses each, orders by tempo / key / energy along a `build` curve         |
| Queue     | `enqueue`      | in order — order is preserved, so no shuffle                                |
| Mix       | `set_auto_dj`  | the player shapes each transition to the audio as it plays                  |

The selection step is the model's judgment, not a search index. That is the
part worth understanding: it knows *your* library because it can search it, and
it knows what "late-night" means because it knows the artists in it.

## What it can't do

- **No external catalogue.** Only your library — uploads plus what Rocksky has
  indexed for you.
- **No semantic search over the library.** "Songs that sound like rain" works
  only as far as the model recognises the artists and genres you own. There is
  no embedding index; selection is text search, history, recommendations and
  judgment.
- **Not beat-matching.** No time-stretching and no phase alignment — tracks
  play at their own tempo. `plan_set` avoids awkward tempo jumps; it doesn't
  erase them.
- **First analysis costs a download.** A second or so of CPU per track, plus the
  fetch. That is why a set is planned from tens of candidates, not thousands.
  Everything is cached in SQLite afterwards, so the second set is instant. To
  warm a machine up front: `playerd analyze ~/Music`.
- **Tempo can land an octave out.** Onset detection reads some tracks at double
  or half time. Comparisons use `danceBpm` (folded to 70–140), so sequencing is
  unaffected — but don't read raw `bpm` as gospel.
- **Energy is a heuristic**, from loudness, tempo and dynamic range. It ranks a
  loud fast record above a quiet slow one, which is usually what you meant.
- **A few AAC files can't be analysed.** They still play; their transitions fall
  back to a plain crossfade.

## The tools underneath

| Group     | Tools                                                                                                                         |
| --------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Devices   | `list_devices`, `get_player_state`, `set_primary_device`                                                                      |
| Transport | `play`, `pause`, `next_track`, `previous_track`, `seek`, `set_volume`, `set_playback_mode`                                    |
| Queue     | `get_queue`, `enqueue`, `queue_jump`, `queue_remove`, `queue_move`, `clear_queue`                                             |
| Library   | `search_library`, `get_album`, `get_artist`, `browse_songs`, `browse_albums`, `list_genres`, `list_playlists`, `get_playlist` |
| Taste     | `whoami`, `get_recommendations`, `get_listening_history`                                                                      |
| Sound     | `get_audio_settings`, `set_equalizer`, `set_audio_settings`, `list_equalizer_presets`, `apply_equalizer_preset`               |
| Auto DJ   | `set_auto_dj`, `analyze_tracks`, `plan_set`                                                                                   |

All 35 speak the same remote-control protocol as the web and desktop
miniplayers, so anything the agent does shows up there too — and anything you
do there is visible to the agent.

For the daemon itself — install, config, audio outputs, running as a service —
see the [playerd README](README.md). For the wire protocol, see
[PROTOCOL.md](../remote-ws/PROTOCOL.md).
