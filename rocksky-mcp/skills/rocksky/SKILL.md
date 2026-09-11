---
name: rocksky
description: Use the Rocksky MCP server (`rocksky mcp`) to control the listener's music players, browse their library, and read their Rocksky scrobbling account. Use when asked to play, queue, pause, skip or change the volume on their speakers, to search or browse their music library, to adjust the equalizer or other audio settings, to answer "what am I listening to", "what did I play this week", "what are my top artists", "what is <someone> listening to", for their listening stats or recommendations, for the Rocksky charts, or to create a Rocksky API key. Also covers installing and registering the server when the tools are not available yet.
---

# Rocksky

One server, three things: the listener's **players** (real speakers, real
audio, right now), their **library**, and their **Rocksky account**.

The player half is a *controller* on Rocksky's remote-control protocol — the
same one the web and desktop miniplayers speak — so it commands every device on
the account wherever it runs, and anything it does is visible in those apps too.
Music is loud, in someone's room: before replacing what is already playing, say
what you are about to do, or add to the queue instead.

## Check the tools are there first

If tools like `list_devices`, `search_library` and `get_scrobbles` are
available, skip to [Getting oriented](#getting-oriented). Otherwise:

**1. Install the CLI and log in.** The server ships with it and reads the token
`rocksky login` writes to `~/.rocksky/token.json`:

```sh
npm install -g @rocksky/cli
rocksky login <handle>.bsky.social
```

`ROCKSKY_TOKEN=<jwt>` in the environment works instead. The server on its own is
`npm install -g @rocksky/mcp` (the `rocksky-mcp` command), or `cargo build
--release` in `rocksky-mcp/`.

**2. Register it** with the agent, then restart it:

```sh
# Claude Code
claude mcp add rocksky -- rocksky mcp
```

```jsonc
// Claude Desktop — claude_desktop_config.json
// VS Code / GitHub Copilot — .vscode/mcp.json uses "servers" and needs "type": "stdio"
{ "mcpServers": { "rocksky": { "command": "rocksky", "args": ["mcp"] } } }
```

```toml
# Codex — ~/.codex/config.toml
[mcp_servers.rocksky]
command = "rocksky"
args = ["mcp"]
```

Nothing else to configure: it points at the hosted Rocksky and provisions its
own library credentials on first use.

**3. Have something to play on** — only if playback is wanted. The server
controls devices; it is not one. An open Rocksky web or desktop app already
counts. For a headless player (a Pi on the amp, a server, a headphone rig),
install [playerd](https://github.com/tsirysndr/rocksky/tree/main/playerd) there
and run `playerd --name "Living Room"`.

## Getting oriented

`whoami` once, when you need the listener's own handle or DID.

`list_devices` before any playback: it names the players that are online and
shows what each is doing. Every command tool takes an optional `device` — an id
or a name, partial and case-insensitive ("living" finds "Living Room"). Omit it
when there is only one player and it is picked for you; pass `"all"` to
broadcast. `get_player_state` is the "what is happening" call.

Two similar-sounding tools, two different questions:

| Question                                    | Tool               |
| ------------------------------------------- | ------------------ |
| What is playing on a speaker I can control? | `get_player_state` |
| What is this account scrobbling right now?  | `get_now_playing`  |

## Playing something

Two kinds of results get queued, and knowing which you have saves a round trip:

- **Library results carry an `id`** — `search_library`, `browse_songs`,
  `browse_albums`, `get_album`, `get_artist`, `get_playlist`. Pass those ids to
  `enqueue`.
- **Everything else carries only names** — `get_recommendations`,
  `get_listening_history`, `get_top`, `get_scrobbles`, `get_charts`, `search`.
  Pass them to `enqueue` as `{title, artist}` and it matches them against the
  library itself, reporting anything it could not place under `unresolved`
  rather than failing the call.

`enqueue` also takes `album_id` or `playlist_id` to queue a whole album or
playlist in order. Modes matter:

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

While something runs: `next_track` to drop a track, `queue_remove` to pull one
that has not played yet, `queue_move` to reorder, `enqueue` with `next` to slot
in a request, `clear_queue` (keeps the current track by default) to start over.

## Building a set

A request like "put on something for cooking dinner" is a brief, not a search.

1. **Read the room** — `get_player_state` for what is playing now, then
   `get_listening_history` (`top` / `loved` / `recent`) for what this listener
   actually likes.
2. **Source candidates** — `get_recommendations` for adjacency, `browse_songs`
   with `kind: "random"` and a genre or year range for variety,
   `search_library` for specific artists, `get_album` when an album deserves to
   be heard whole.
3. **Sequence it** — 8–15 tracks is a set; more is a shift nobody asked for.
   Open near where the room already is, build, and give it an end. Avoid two
   tracks by the same artist back to back unless it is deliberate.
4. **Queue it** in one `enqueue` call — order is preserved. Do not pass
   `shuffle: true` after sequencing deliberately; it throws the order away.
5. **Confirm** with `get_player_state`, and say what is on and what follows.

For beat- and key-aware transitions, Auto DJ and track analysis, that is
playerd's MCP server and the **rocksky-dj** skill — this one does not analyse
audio.

## Answering questions about the account

Each of these takes an optional `actor` (a handle or a DID) and falls back to
the logged-in account, so they answer for the listener *or* for anyone else on
Rocksky:

| Ask                                   | Tool                                         |
| ------------------------------------- | -------------------------------------------- |
| Who am I signed in as?                | `whoami`                                     |
| Who is this person?                   | `get_profile`                                |
| How much have I listened?             | `get_stats`                                  |
| What have I played recently?          | `get_scrobbles` (paging via `offset`)        |
| What are my top artists/albums/songs? | `get_top` with `kind`                        |
| What do I love?                       | `get_top` with `kind: "loved"`               |
| What is playing for them right now?   | `get_now_playing`                            |
| What is everyone playing?             | `get_charts` (`all`, `7d`, `4w`, `6m`, `1y`) |
| Does Rocksky know this artist?        | `search`                                     |

`search` is platform-wide and returns names; `search_library` is the listener's
own music and returns playable ids. For something to play, use the latter.

`create_api_key` mints a credential for a third-party scrobbler. It never
returns the key itself — point the listener at https://rocksky.app/settings to
read it once. Do not call it unless they asked for a key.

## Sound

`set_equalizer` takes ten dB gains for 32, 64, 125, 250, 500, 1k, 2k, 4k, 8k and
16k Hz. Keep within ±12 dB, and set `precut_db` near your largest positive gain
so it does not clip. `apply_equalizer_preset` loads one the listener saved;
`list_equalizer_presets` shows them.

`set_audio_settings` reaches the rest of the chain — crossfade, ReplayGain,
crossfeed, compressor, surround, PBE — applying only the sections you pass:

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
- **Taste** — `get_listening_history`, `get_recommendations`
- **Account** — `whoami`, `get_profile`, `get_stats`, `get_scrobbles`,
  `get_top`, `get_now_playing`, `search`, `get_charts`, `create_api_key`
- **Sound** — `get_audio_settings`, `set_equalizer`, `set_audio_settings`,
  `list_equalizer_presets`, `apply_equalizer_preset`

## When something is off

- **"no players are online"** — nothing is running. Have the listener open the
  Rocksky app, or start `playerd` on the machine that should play. Devices
  appear a second or two after they first push state.
- **"several players are online — pass `device`"** — name one, or ask which.
- **A track was skipped as unresolved** — it is not in this library. Try
  `search_library` with just the title, or pick something else.
- **Commands do nothing** — check `get_player_state`: a player that has gone
  offline still lingers briefly in the device list.
- **Auth failures ("is the access token still valid?")** — the token expired;
  `rocksky login` again.
- **An empty library** — the Subsonic credentials are provisioned on first use
  and cached in `~/.rocksky/navidrome.json`; deleting that file re-provisions
  them.
