# Rocksky MCP tools

Every tool the `rocksky-mcp` server advertises, generated from its own
`tools/list` output — run `rocksky-mcp tools` for the raw JSON schemas.

## Players

Every device online for the account. Each of these takes an optional `device`.

### list_devices

List every Rocksky player currently online for this account (playerd daemons, the desktop app, open web miniplayers) with what each is playing. Start here when you do not know which device to command.

No parameters.

### get_player_state

What a player is doing right now: transport state, the current track with elapsed position, shuffle/repeat/volume, and the queue.

| Parameter       | Type      | Required | What it is                                                                                                                                                                                                                      |
| --------------- | --------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `device`        | `string`  | no       | Which player to command: its id, or its name (case-insensitive, partial match is fine). Omit when only one player is online — the tool picks it, or the primary device. Pass "all" to broadcast to every device on the account. |
| `include_queue` | `boolean` | no       | Include the full queue (default true). Turn off when you only need the current track.                                                                                                                                           |

### set_primary_device

Make a device the primary one, so its now-playing drives the public Rocksky profile status.

| Parameter | Type     | Required | What it is                                                                                                                                                                                                                      |
| --------- | -------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `device`  | `string` | yes      | Which player to command: its id, or its name (case-insensitive, partial match is fine). Omit when only one player is online — the tool picks it, or the primary device. Pass "all" to broadcast to every device on the account. |

### play

Resume playback (or start the cued track).

| Parameter | Type     | Required | What it is                                                                                                                                                                                                                      |
| --------- | -------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `device`  | `string` | no       | Which player to command: its id, or its name (case-insensitive, partial match is fine). Omit when only one player is online — the tool picks it, or the primary device. Pass "all" to broadcast to every device on the account. |

### pause

Pause playback, keeping the position.

| Parameter | Type     | Required | What it is                                                                                                                                                                                                                      |
| --------- | -------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `device`  | `string` | no       | Which player to command: its id, or its name (case-insensitive, partial match is fine). Omit when only one player is online — the tool picks it, or the primary device. Pass "all" to broadcast to every device on the account. |

### next_track

Skip to the next track in the queue.

| Parameter | Type     | Required | What it is                                                                                                                                                                                                                      |
| --------- | -------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `device`  | `string` | no       | Which player to command: its id, or its name (case-insensitive, partial match is fine). Omit when only one player is online — the tool picks it, or the primary device. Pass "all" to broadcast to every device on the account. |

### previous_track

Go back to the previous track in the queue.

| Parameter | Type     | Required | What it is                                                                                                                                                                                                                      |
| --------- | -------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `device`  | `string` | no       | Which player to command: its id, or its name (case-insensitive, partial match is fine). Omit when only one player is online — the tool picks it, or the primary device. Pass "all" to broadcast to every device on the account. |

### seek

Jump to a position within the current track.

| Parameter     | Type      | Required | What it is                                                                                                                                                                                                                      |
| ------------- | --------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `device`      | `string`  | no       | Which player to command: its id, or its name (case-insensitive, partial match is fine). Omit when only one player is online — the tool picks it, or the primary device. Pass "all" to broadcast to every device on the account. |
| `position_ms` | `integer` | yes      | Position from the start of the track, in milliseconds.                                                                                                                                                                          |

### set_volume

Set output volume.

| Parameter | Type     | Required | What it is                                                                                                                                                                                                                      |
| --------- | -------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `device`  | `string` | no       | Which player to command: its id, or its name (case-insensitive, partial match is fine). Omit when only one player is online — the tool picks it, or the primary device. Pass "all" to broadcast to every device on the account. |
| `volume`  | `number` | yes      | 0.0 (silent) to 1.0 (full).                                                                                                                                                                                                     |

### set_playback_mode

Turn queue shuffle on/off and set the repeat mode. Pass either or both.

| Parameter | Type                    | Required | What it is                                                                                                                                                                                                                      |
| --------- | ----------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `device`  | `string`                | no       | Which player to command: its id, or its name (case-insensitive, partial match is fine). Omit when only one player is online — the tool picks it, or the primary device. Pass "all" to broadcast to every device on the account. |
| `repeat`  | `off` \| `one` \| `all` | no       |                                                                                                                                                                                                                                 |
| `shuffle` | `boolean`               | no       |                                                                                                                                                                                                                                 |

## Queue

Indices come from `get_queue`.

### get_queue

The player's queue, with the index of the currently playing entry. Indices are what queue_jump / queue_remove / queue_move take.

| Parameter | Type     | Required | What it is                                                                                                                                                                                                                      |
| --------- | -------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `device`  | `string` | no       | Which player to command: its id, or its name (case-insensitive, partial match is fine). Omit when only one player is online — the tool picks it, or the primary device. Pass "all" to broadcast to every device on the account. |

### enqueue

Put music on a player. Supply tracks (by library id, or just title + artist and they get matched against the library), or an album_id, or a playlist_id. This is how you start a set, add to it, or slip one song in next.

| Parameter     | Type                      | Required | What it is                                                                                                                                                                                                                                                       |
| ------------- | ------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `album_id`    | `string`                  | no       | Queue a whole album, in track order.                                                                                                                                                                                                                             |
| `device`      | `string`                  | no       | Which player to command: its id, or its name (case-insensitive, partial match is fine). Omit when only one player is online — the tool picks it, or the primary device. Pass "all" to broadcast to every device on the account.                                  |
| `mode`        | `now` \| `next` \| `last` | no       | "now" replaces the queue and starts playing (default), "next" inserts after the current track, "last" appends.                                                                                                                                                   |
| `playlist_id` | `string`                  | no       | Queue a whole playlist, in order.                                                                                                                                                                                                                                |
| `shuffle`     | `boolean`                 | no       | Shuffle the batch as it is queued. Only applies to mode "now".                                                                                                                                                                                                   |
| `start_index` | `integer`                 | no       | Which entry of the batch to start on, for mode "now" (default 0).                                                                                                                                                                                                |
| `tracks`      | array                     | no       | Tracks to queue, in order. Each entry is either {"id": "<library id from search_library>"} or {"title": "...", "artist": "..."} — names are resolved against the library, and anything with no match is reported back as unresolved instead of failing the call. |

### queue_jump

Play a specific position in the queue.

| Parameter | Type      | Required | What it is                                                                                                                                                                                                                      |
| --------- | --------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `device`  | `string`  | no       | Which player to command: its id, or its name (case-insensitive, partial match is fine). Omit when only one player is online — the tool picks it, or the primary device. Pass "all" to broadcast to every device on the account. |
| `index`   | `integer` | yes      | Queue position, from get_queue.                                                                                                                                                                                                 |

### queue_remove

Drop one entry from the queue.

| Parameter | Type      | Required | What it is                                                                                                                                                                                                                      |
| --------- | --------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `device`  | `string`  | no       | Which player to command: its id, or its name (case-insensitive, partial match is fine). Omit when only one player is online — the tool picks it, or the primary device. Pass "all" to broadcast to every device on the account. |
| `index`   | `integer` | yes      |                                                                                                                                                                                                                                 |

### queue_move

Reorder the queue by moving one entry to another position.

| Parameter | Type      | Required | What it is                                                                                                                                                                                                                      |
| --------- | --------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `device`  | `string`  | no       | Which player to command: its id, or its name (case-insensitive, partial match is fine). Omit when only one player is online — the tool picks it, or the primary device. Pass "all" to broadcast to every device on the account. |
| `from`    | `integer` | yes      |                                                                                                                                                                                                                                 |
| `to`      | `integer` | yes      |                                                                                                                                                                                                                                 |

### clear_queue

Empty the queue. By default the currently playing track is kept (and keeps playing); pass keep_current false to stop and clear everything.

| Parameter      | Type      | Required | What it is                                                                                                                                                                                                                      |
| -------------- | --------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `device`       | `string`  | no       | Which player to command: its id, or its name (case-insensitive, partial match is fine). Omit when only one player is online — the tool picks it, or the primary device. Pass "all" to broadcast to every device on the account. |
| `keep_current` | `boolean` | no       | Default true.                                                                                                                                                                                                                   |

## Library

The listener's own music, over Rocksky's Subsonic-compatible API. Results carry the ids `enqueue` takes.

### search_library

Search the listener's music library (their uploads and everything Rocksky has indexed for them) for tracks, albums and artists. Results carry the ids that enqueue, get_album and get_artist take. An at:// record URI works as a query too.

| Parameter | Type                                       | Required | What it is                                         |
| --------- | ------------------------------------------ | -------- | -------------------------------------------------- |
| `kind`    | `tracks` \| `albums` \| `artists` \| `all` | no       | What to look for (default "tracks").               |
| `limit`   | `integer`                                  | no       | Max results per kind (default 20).                 |
| `offset`  | `integer`                                  | no       | Skip this many results, for paging.                |
| `query`   | `string`                                   | yes      | Free text: title, artist, album — or an at:// URI. |

### get_album

An album and its tracks, in order. Accepts an album id or an album title (optionally narrowed with artist).

| Parameter | Type     | Required | What it is                                     |
| --------- | -------- | -------- | ---------------------------------------------- |
| `album`   | `string` | yes      | Album id (from search_library) or album title. |
| `artist`  | `string` | no       | Narrows a title lookup to one artist.          |

### get_artist

An artist and their albums in the library. Accepts an artist id or a name.

| Parameter | Type     | Required | What it is                                      |
| --------- | -------- | -------- | ----------------------------------------------- |
| `artist`  | `string` | yes      | Artist id (from search_library) or artist name. |

### browse_songs

Pull a batch of tracks from the library without searching for anything in particular — the fastest way to source a set. "random" honours the genre/year filters, "starred" returns loved tracks, "genre" lists a genre in full.

| Parameter   | Type                             | Required | What it is                                               |
| ----------- | -------------------------------- | -------- | -------------------------------------------------------- |
| `count`     | `integer`                        | no       | How many tracks (default 25).                            |
| `from_year` | `integer`                        | no       | Earliest release year, for kind "random".                |
| `genre`     | `string`                         | no       | Required for kind "genre"; optional filter for "random". |
| `kind`      | `random` \| `starred` \| `genre` | no       | Default "random".                                        |
| `offset`    | `integer`                        | no       | Paging, for kind "genre".                                |
| `to_year`   | `integer`                        | no       | Latest release year, for kind "random".                  |

### browse_albums

Browse albums in the library by a listing rather than a search: what is new, what gets played, what is starred, or a slice of a genre or a year range.

| Parameter   | Type                                                                                                         | Required | What it is                   |
| ----------- | ------------------------------------------------------------------------------------------------------------ | -------- | ---------------------------- |
| `count`     | `integer`                                                                                                    | no       | Default 20.                  |
| `from_year` | `integer`                                                                                                    | no       | For kind "byYear".           |
| `genre`     | `string`                                                                                                     | no       | Required for kind "byGenre". |
| `kind`      | `newest` \| `frequent` \| `recent` \| `random` \| `starred` \| `alphabeticalByName` \| `byYear` \| `byGenre` | no       | Default "newest".            |
| `offset`    | `integer`                                                                                                    | no       |                              |
| `to_year`   | `integer`                                                                                                    | no       | For kind "byYear".           |

### list_genres

Genres present in the library, with how many tracks and albums each has. Use these exact names when filtering.

No parameters.

### list_playlists

The listener's saved playlists.

No parameters.

### get_playlist

A playlist and its tracks, in order. Accepts a playlist id or its name.

| Parameter  | Type     | Required | What it is                                 |
| ---------- | -------- | -------- | ------------------------------------------ |
| `playlist` | `string` | yes      | Playlist id (from list_playlists) or name. |

### get_listening_history

What this listener actually plays: their most-played tracks, their loved tracks, or their recent scrobbles. Read this before building a set for them.

| Parameter | Type                         | Required | What it is                                                                      |
| --------- | ---------------------------- | -------- | ------------------------------------------------------------------------------- |
| `kind`    | `top` \| `loved` \| `recent` | no       | "top" = most played (default), "loved" = favourites, "recent" = last scrobbles. |
| `limit`   | `integer`                    | no       | Default 20.                                                                     |

### get_recommendations

What Rocksky thinks this listener would like next, from their listening history and their neighbours'. Returns names, not library ids — pass them straight to enqueue, which matches them against the library.

| Parameter | Type                              | Required | What it is        |
| --------- | --------------------------------- | -------- | ----------------- |
| `kind`    | `tracks` \| `artists` \| `albums` | no       | Default "tracks". |
| `limit`   | `integer`                         | no       | Default 20.       |

## Audio

Reads the saved settings record; the setters push to a running player without rewriting it.

### get_audio_settings

The listener's saved cross-device audio settings (the app.rocksky.rockbox.audio.settings record every Rocksky player starts from): equalizer, tone, crossfade and ReplayGain.

No parameters.

### set_equalizer

Shape the sound on a running player: 10-band EQ gains, bass and treble. Bands are 32, 64, 125, 250, 500, 1k, 2k, 4k, 8k and 16k Hz, in that order. Takes effect at once; it does not change the listener's saved settings.

| Parameter   | Type      | Required | What it is                                                                                                                                                                                                                      |
| ----------- | --------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bands_db`  | array     | no       | Gain in dB for each of the 10 bands, low to high. Keep within about ±12 dB.                                                                                                                                                     |
| `bass_db`   | `integer` | no       | Bass tone control, whole dB.                                                                                                                                                                                                    |
| `device`    | `string`  | no       | Which player to command: its id, or its name (case-insensitive, partial match is fine). Omit when only one player is online — the tool picks it, or the primary device. Pass "all" to broadcast to every device on the account. |
| `enabled`   | `boolean` | no       | Turn the equalizer on or off.                                                                                                                                                                                                   |
| `precut_db` | `number`  | no       | Headroom attenuation applied before the EQ, in dB (0 = none). Set it near your largest positive band gain to avoid clipping.                                                                                                    |
| `treble_db` | `integer` | no       | Treble tone control, whole dB.                                                                                                                                                                                                  |

### set_audio_settings

Push a full audio-settings document to a running player: any of equalizer, tone, crossfade, replayGain, crossfeed, compressor, surround and pbe. Sections you leave out are untouched, and a player ignores sections its engine does not implement. Use set_equalizer for plain EQ work; reach for this for crossfade, ReplayGain and the rest.

| Parameter  | Type     | Required | What it is                                                                                                                                                                                                                                   |
| ---------- | -------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `device`   | `string` | no       | Which player to command: its id, or its name (case-insensitive, partial match is fine). Omit when only one player is online — the tool picks it, or the primary device. Pass "all" to broadcast to every device on the account.              |
| `settings` | `object` | yes      | Units: EQ gain/precut and ReplayGain preamp and crossfeed gains in TENTHS of a dB (precut <= 0); EQ q is Q x 10; bass/treble in whole dB; cutoffs in Hz; fade times and compressor attack/release in ms; balance and stereoWidth in percent. |

### list_equalizer_presets

The listener's saved EQ presets (app.rocksky.equalizer records), with their bands.

No parameters.

### apply_equalizer_preset

Load a saved EQ preset onto a running player, by name or AT URI.

| Parameter | Type     | Required | What it is                                                                                                                                                                                                                      |
| --------- | -------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `device`  | `string` | no       | Which player to command: its id, or its name (case-insensitive, partial match is fine). Omit when only one player is online — the tool picks it, or the primary device. Pass "all" to broadcast to every device on the account. |
| `preset`  | `string` | yes      | Preset name (or rkey), or an at://did/app.rocksky.equalizer/rkey URI for someone else's.                                                                                                                                        |

## Account

The Rocksky AppView. Every read takes an optional `actor` (handle or DID) and falls back to the logged-in account.

### whoami

The Rocksky account this server is authenticated as. Call it once when you need the listener's own handle or DID.

No parameters.

### get_profile

A Rocksky user's public profile: handle, display name, avatar and their profile page.

| Parameter | Type     | Required | What it is                                                                                                 |
| --------- | -------- | -------- | ---------------------------------------------------------------------------------------------------------- |
| `actor`   | `string` | no       | Whose data to read: a Rocksky/Bluesky handle (alice.bsky.social) or a DID. Omit for the logged-in account. |

### get_stats

How much a user has listened: total scrobbles, and how many distinct tracks, albums, artists and loved tracks that adds up to.

| Parameter | Type     | Required | What it is                                                                                                 |
| --------- | -------- | -------- | ---------------------------------------------------------------------------------------------------------- |
| `actor`   | `string` | no       | Whose data to read: a Rocksky/Bluesky handle (alice.bsky.social) or a DID. Omit for the logged-in account. |

### get_scrobbles

A user's scrobbles, newest first — what they actually played, when. This is history, not the library: entries are names, so pass them through enqueue to play one again.

| Parameter | Type      | Required | What it is                                                                                                 |
| --------- | --------- | -------- | ---------------------------------------------------------------------------------------------------------- |
| `actor`   | `string`  | no       | Whose data to read: a Rocksky/Bluesky handle (alice.bsky.social) or a DID. Omit for the logged-in account. |
| `limit`   | `integer` | no       | Default 20.                                                                                                |
| `offset`  | `integer` | no       | Skip this many, for paging further back.                                                                   |

### get_top

A user's most-played music, or their loved tracks. Use this to learn someone's taste before recommending or queueing anything.

| Parameter | Type                                        | Required | What it is                                                                                                 |
| --------- | ------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------- |
| `actor`   | `string`                                    | no       | Whose data to read: a Rocksky/Bluesky handle (alice.bsky.social) or a DID. Omit for the logged-in account. |
| `kind`    | `songs` \| `albums` \| `artists` \| `loved` | no       | Default "songs".                                                                                           |
| `limit`   | `integer`                                   | no       | Default 20.                                                                                                |

### get_now_playing

What a user is scrobbling right this moment (from Rocksky, or their connected Spotify when Rocksky has nothing). For the state of a player you control, use get_player_state instead.

| Parameter | Type     | Required | What it is                                                                                                 |
| --------- | -------- | -------- | ---------------------------------------------------------------------------------------------------------- |
| `actor`   | `string` | no       | Whose data to read: a Rocksky/Bluesky handle (alice.bsky.social) or a DID. Omit for the logged-in account. |

### search

Search everything Rocksky has indexed — tracks, albums, artists, playlists and user accounts — across the whole platform, not just this listener's library. For something to play, prefer search_library, whose results carry playable ids.

| Parameter | Type                                                                 | Required | What it is                                         |
| --------- | -------------------------------------------------------------------- | -------- | -------------------------------------------------- |
| `kind`    | `tracks` \| `albums` \| `artists` \| `playlists` \| `users` \| `all` | no       | Narrow the results (default "all").                |
| `limit`   | `integer`                                                            | no       | Max results (default 20).                          |
| `query`   | `string`                                                             | yes      | Free text: a title, an artist, an album, a handle. |

### get_charts

What the whole Rocksky community is playing: the top artists or tracks over a period.

| Parameter  | Type                  | Required | What it is                                            |
| ---------- | --------------------- | -------- | ----------------------------------------------------- |
| `interval` | `string`              | no       | "all" (default), or a rolling window: 7d, 4w, 6m, 1y. |
| `kind`     | `artists` \| `tracks` | no       | Default "tracks".                                     |
| `limit`    | `integer`             | no       | Default 20.                                           |

### create_api_key

Mint an API key for the logged-in account — the credential a third-party scrobbler (or the Last.fm-compatible endpoint) authenticates with. The key itself is shown once, in Rocksky's settings.

| Parameter     | Type     | Required | What it is                                   |
| ------------- | -------- | -------- | -------------------------------------------- |
| `description` | `string` | no       | Optional longer note.                        |
| `name`        | `string` | yes      | What the key is for, e.g. "my-raspberry-pi". |
