# Rocksky Lexicons

Examples below are real records fetched from production PDSes via `com.atproto.repo.getRecord` / `com.atproto.repo.listRecords` against `https://api.rocksky.app/xrpc` and the corresponding user's PDS. Lexicon source files live under `apps/api/lexicons/`.

## `app.rocksky.actor.status`

The current listening status of an actor. Single record per repo with `rkey: self`. Created/refreshed each time the actor begins playing a track and expires automatically (track duration + idle time).

### Example record
```json
{
  "$type": "app.rocksky.actor.status",
  "track": {
    "name": "Papercut",
    "album": "Hybrid Theory (Bonus Edition)",
    "artist": "Linkin Park",
    "source": "spotify",
    "durationMs": 184866,
    "albumCoverUrl": "https://i.scdn.co/image/ab67616d0000b273e2f039481babe23658fc719a",
    "recordingMbId": "22575d46-2ada-4659-b40f-5113c0878600"
  },
  "startedAt": "2026-06-02T13:16:03.133Z",
  "expiresAt": "2026-06-02T13:19:07.999Z"
}
```

## `app.rocksky.album`

### Example record
```json
{
  "$type": "app.rocksky.album",
  "title": "Jazzploitation",
  "artist": "Calibro 35",
  "year": 2024,
  "releaseDate": "2024-10-18T00:00:00.000Z",
  "albumArtUrl": "https://i.scdn.co/image/ab67616d0000b2739a8e268beabdca126a35b0f6",
  "createdAt": "2026-06-02T13:15:33.090Z"
}
```

`albumArt` may also appear as an inline blob:
```json
"albumArt": {
  "$type": "blob",
  "ref": { "$link": "bafkreigxbmkowezanfdgn4qnvsl2tfbqqjoxdrkaqk7tjst3x6kcklwazy" },
  "mimeType": "image/jpeg",
  "size": 316543
}
```

## `app.rocksky.artist`

### Example record
```json
{
  "$type": "app.rocksky.artist",
  "name": "Calibro 35",
  "tags": ["jazz funk"],
  "pictureUrl": "https://i.scdn.co/image/ab6761610000e5ebea9472d3894a1bde2b606121",
  "createdAt": "2026-06-02T13:15:32.762Z"
}
```

`picture` may also appear as an inline blob (`$type: blob`, `ref.$link`, `mimeType`, `size`) when the image was uploaded rather than referenced by URL.

## `app.rocksky.feed.generator`

Declares a custom feed generator. `rkey` is the generator's short name.

### Example record
```json
{
  "$type": "app.rocksky.feed.generator",
  "did": "did:web:discover.rocksky.app",
  "displayName": "Popular With Friends",
  "description": "A mix of popular songs from accounts you follow and songs that your follows like.",
  "createdAt": "2025-10-12T04:57:52.745Z"
}
```

## `app.rocksky.graph.follow`

Social "follow" of another account. `subject` is a raw DID (not a strongRef).

### Example record
```json
{
  "$type": "app.rocksky.graph.follow",
  "subject": "did:plc:rlwgbwqdknilpxxep5gvzc3y",
  "createdAt": "2026-06-01T14:21:16.806Z"
}
```

## `app.rocksky.like`

### Example record
```json
{
  "$type": "app.rocksky.like",
  "subject": {
    "uri": "at://did:plc:7vdlgi2bflelz7mmuxoqjfcr/app.rocksky.song/3mmeq5hsh542r",
    "cid": "bafyreiamlpyy5rbnumhgq2iulz7p73l36aaogdebz4zi3q5cz3nslpbrbu"
  },
  "createdAt": "2026-06-01T12:43:16.524Z"
}
```

## `app.rocksky.playlist`

### Example record
```json
{
  "$type": "app.rocksky.playlist",
  "name": "Hip Hop US",
  "description": "",
  "picture": {
    "$type": "blob",
    "ref": { "$link": "bafkreiclplbmi5s2tocvzp3227rsquh2esbtsxuaejwe2ajkaalznico3i" },
    "mimeType": "image/jpeg",
    "size": 50247
  },
  "spotifyLink": "https://open.spotify.com/playlist/40fEXcsbQix2oK4QzRPVAl",
  "createdAt": "2025-03-09T13:07:08.176Z"
}
```

## `app.rocksky.playlistItem`

A single entry within a playlist. Lexicon defined in `apps/api/lexicons/playlist/playlistItem.json`; no on-network instances were discovered at the time of writing — the schema-based shape is:

```json
{
  "$type": "app.rocksky.playlistItem",
  "subject": {
    "uri": "at://did:plc:.../app.rocksky.playlist/<rkey>",
    "cid": "bafyrei..."
  },
  "track": {
    "title": "...",
    "artist": "...",
    "uri": "at://did:plc:.../app.rocksky.song/<rkey>"
  },
  "order": 0,
  "createdAt": "2026-06-02T00:00:00.000Z"
}
```

`track` is an `app.rocksky.song.defs#songViewBasic`.

## `app.rocksky.radio`

A user-declared radio station. Lexicon defined in `apps/api/lexicons/radio/radio.json`; no on-network instances were discovered at the time of writing — the schema-based shape is:

```json
{
  "$type": "app.rocksky.radio",
  "name": "FIP",
  "url": "https://icecast.radiofrance.fr/fip-hifi.aac",
  "description": "Eclectic music from Radio France.",
  "genre": "eclectic",
  "website": "https://www.radiofrance.fr/fip",
  "createdAt": "2026-06-02T00:00:00.000Z"
}
```

## `app.rocksky.scrobble`

### Example record
```json
{
  "$type": "app.rocksky.scrobble",
  "title": "Chaser",
  "artist": "Calibro 35",
  "artists": [
    { "name": "Calibro 35", "mbid": "7b6baeda-94ec-4475-9b09-6486a36c8e40" }
  ],
  "albumArtist": "Calibro 35",
  "album": "Jazzploitation",
  "duration": 182320,
  "trackNumber": 1,
  "discNumber": 1,
  "year": 2024,
  "releaseDate": "2024-10-18T00:00:00.000Z",
  "tags": ["jazz funk"],
  "mbid": "58a46583-dc71-4d4f-bdde-a7323578873e",
  "isrc": "ITG582400039",
  "albumArtUrl": "https://i.scdn.co/image/ab67616d0000b2739a8e268beabdca126a35b0f6",
  "spotifyLink": "https://open.spotify.com/track/3zrtwgbIxpAvUxW0QGb1Lk",
  "createdAt": "2026-06-02T13:15:09.000Z"
}
```

Optional fields not in the example above but defined by the lexicon: `genre`, `composer`, `lyrics`, `copyrightMessage`, `wiki`, `label`, `albumArt` (blob), `youtubeLink`, `tidalLink`, `appleMusicLink`.

## `app.rocksky.shout`

Reply shouts include a `parent` strongRef; top-level shouts omit it.

### Example record (reply)
```json
{
  "$type": "app.rocksky.shout",
  "message": "test",
  "subject": {
    "uri": "at://did:plc:7vdlgi2bflelz7mmuxoqjfcr/app.rocksky.scrobble/3lik6myiabc2g",
    "cid": "bafyreiasxykhkr6mfdcqmd5lg3pnohkx2kgskmbnkodtjwmrjyx3ubryr4"
  },
  "parent": {
    "uri": "at://did:plc:7vdlgi2bflelz7mmuxoqjfcr/app.rocksky.shout/3lik6ogwdwk2g",
    "cid": "bafyreifbokyl7rbgqnu6xpvzwt5tdhlxqdaf6rb4j7l67y5oi4g7r3zrym"
  },
  "createdAt": "2025-02-19T16:22:22.585Z"
}
```

`subject` can target any record type — examples seen in production point at `app.rocksky.scrobble`, `app.rocksky.artist`, `app.rocksky.album`, and `app.bsky.actor.profile`.

## `app.rocksky.song`

### Example record
```json
{
  "$type": "app.rocksky.song",
  "title": "Chaser",
  "artist": "Calibro 35",
  "artists": [
    { "name": "Calibro 35", "mbid": "7b6baeda-94ec-4475-9b09-6486a36c8e40" }
  ],
  "albumArtist": "Calibro 35",
  "album": "Jazzploitation",
  "duration": 182320,
  "trackNumber": 1,
  "discNumber": 1,
  "year": 2024,
  "releaseDate": "2024-10-18T00:00:00.000Z",
  "tags": ["jazz funk"],
  "mbid": "58a46583-dc71-4d4f-bdde-a7323578873e",
  "isrc": "ITG582400039",
  "albumArtUrl": "https://i.scdn.co/image/ab67616d0000b2739a8e268beabdca126a35b0f6",
  "spotifyLink": "https://open.spotify.com/track/3zrtwgbIxpAvUxW0QGb1Lk",
  "createdAt": "2026-06-02T13:15:29.378Z"
}
```

The `song` and `scrobble` lexicons share the same shape — a `song` is the canonical track record in the user's repo, while a `scrobble` records one play of it.
