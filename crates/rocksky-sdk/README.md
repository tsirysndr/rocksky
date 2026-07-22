# rocksky-sdk

The official Rust SDK for [Rocksky](https://rocksky.app) — a music scrobbling &
discovery platform on the [AT Protocol](https://atproto.com) — built on top of
[jacquard](https://crates.io/crates/jacquard).

Its shape mirrors Bluesky's [`@atproto/api`](https://github.com/bluesky-social/atproto/tree/main/packages/api):
a `RockskyAgent` wraps a jacquard session and exposes high-level convenience
verbs plus a typed namespace escape hatch; reads go through an unauthenticated
`AppView` client.

## Quickstart

```rust
use rocksky_sdk::{RockskyAgent, ScrobbleDraft};

async fn demo() -> rocksky_sdk::Result<()> {
    // Log in (persists the session to disk).
    let agent = RockskyAgent::builder()
        .session_store("~/.config/rocksky/session.json")
        .build()?;
    agent.login_password("alice.bsky.social", "app-password").await?;
    // or: agent.login_oauth(Some("alice.bsky.social")).await?;  // browser + loopback

    // Writes — high-level verbs.
    agent
        .scrobble(&ScrobbleDraft {
            title: "Chaser".into(),
            artist: "Calibro 35".into(),
            album: "Jazzploitation".into(),
            album_artist: "Calibro 35".into(),
            duration_ms: 182_320,
            ..Default::default()
        })
        .await?;
    agent.follow("did:plc:rlwgbwqdknilpxxep5gvzc3y").await?;
    agent.like(
        "at://did:plc:…/app.rocksky.song/3mmeq5hsh542r",
        "bafyreiamlpyy5rbnumhgq2iulz7p73l36aaogdebz4zi3q5cz3nslpbrbu",
    ).await?;

    // Reads — unauthenticated, via the bundled AppView client.
    let recent = agent.appview().scrobbles("alice.bsky.social", 25, 0).await?;
    let _ = recent;
    Ok(())
}
```

Read-only, no auth:

```rust
async fn run() -> rocksky_sdk::Result<()> {
use rocksky_sdk::DateInterval;

let av = rocksky_sdk::AppView::new("https://api.rocksky.app");
let charts = av.top_tracks(50, 0).await?;                       // all-time shorthand
let month  = av.top_tracks_interval(DateInterval::LastDays(30), 50, 0).await?;
let stats  = av.global_stats().await?;

// Optional bearer token for auth-gated queries.
let me = rocksky_sdk::AppView::new("https://api.rocksky.app")
    .with_token("<access-token>");
let loved = me.loved_songs("alice.bsky.social", 25, 0).await?;

// Universal escape hatch — call any read query by nsid, get raw JSON.
let raw = av.get("app.rocksky.getStats", &[]).await?;
let _ = (charts, month, stats, loved, raw);
Ok(()) }
```

## Convenience verbs

| Verb                                   | Record(s)                     |
| -------------------------------------- | ----------------------------- |
| `scrobble(draft)` → `ScrobbleResult`   | fans out to **artist + album + song + scrobble** (duplicates skipped) |
| `scrobble_match(title, artist, album, mb_id, isrc)` | resolves full metadata via `match_song`, then the same fan-out (album/mb_id/isrc optional) |
| `create_song(draft)`                   | `app.rocksky.song`            |
| `create_album(draft)`                  | `app.rocksky.album`           |
| `create_artist(draft)`                 | `app.rocksky.artist`          |
| `set_now_playing(track)` / `clear_now_playing()` | `app.rocksky.actor.status` (rkey `self`) |
| `like(uri, cid)` / `unlike(uri)`       | `app.rocksky.like`            |
| `follow(did)` / `unfollow(did)`        | `app.rocksky.graph.follow`    |
| `shout(uri, cid, msg)` / `reply_shout(…)` | `app.rocksky.shout`        |

## Duplicate prevention (`dedup` feature)

Rocksky derives a stable identity hash for every song / album / artist and treats
a scrobble as unique per `(actor, song, second)`. The `dedup` feature mirrors the
user's repo into a local RocksDB index so writes never create duplicates:

```rust
async fn run() -> rocksky_sdk::Result<()> {
use rocksky_sdk::{RockskyAgent, ScrobbleDraft};

let agent = RockskyAgent::builder()
    .session_store("~/.config/rocksky/session.json")
    .dedup_store("~/.config/rocksky/dedup")   // requires the `dedup` feature
    .build()?;
agent.login_password("alice.bsky.social", "app-password").await?;

// Mirror the repo once. Subsequent calls are incremental (getRepo `since=<rev>`),
// so only records added since the last sync are downloaded + indexed.
let stats = agent.sync_repo().await?;
println!("indexed {} records", stats.total());

// One call fans out to artist + album + song + scrobble. Any of those already in
// the repo is skipped (its existing at-uri reused, nothing written); same second +
// same track ⇒ no duplicate scrobble.
let out = agent.scrobble(&ScrobbleDraft {
    title: "Chaser".into(),
    artist: "Calibro 35".into(),
    album: "Jazzploitation".into(),
    album_artist: "Calibro 35".into(),
    duration_ms: 182_320,
    timestamp: Some(1_717_333_509),
    ..Default::default()
}).await?;
println!("scrobble: {}", out.scrobble_uri);
Ok(()) }
```

The identity hashes match the server byte-for-byte and are exposed directly:
`rocksky_sdk::dedup::{song_hash, album_hash, artist_hash}`.

## Live hydration from Jetstream (`jetstream` feature)

Keep the dedup index fresh between CAR syncs by tailing the Bluesky
[Jetstream](https://github.com/bluesky-social/jetstream) firehose. It connects to
**all four public servers at once** (filtered server-side to `app.rocksky.*` for
the account's DID) and applies every commit — create / update / delete — to the
index as it arrives. A shared watermark de-duplicates the overlap between servers
and doubles as the reconnect cursor, so a single server stalling never opens a gap.

```rust
#[cfg(feature = "jetstream")]
async fn run(agent: rocksky_sdk::RockskyAgent) -> rocksky_sdk::Result<()> {
agent.sync_repo().await?;                 // one-time backfill

// Run the live tail on a background task (reconnects + resumes forever).
let bg = agent.clone();
tokio::spawn(async move { bg.hydrate_from_jetstream().await });
Ok(()) }
```

The servers are fully overridable via `JetstreamConfig`:

```rust
#[cfg(feature = "jetstream")]
async fn run(agent: rocksky_sdk::RockskyAgent) -> rocksky_sdk::Result<()> {
use rocksky_sdk::JetstreamConfig;

let config = JetstreamConfig::with_servers([
    "wss://my-jetstream.internal",
    "wss://jetstream1.us-west.bsky.network",
]);
agent.hydrate_from_jetstream_with(config).await?;
Ok(()) }
```

All logging is via `tracing` — no stdout/stderr writes.

## AppView reads

The `AppView` client covers the whole `app.rocksky.*` read surface.

- **Basics**: `profile`, `scrobbles`, `songs`, `albums`, `artists`, `feed`,
  `search`, `top_artists`, `top_tracks`, `global_stats`.
- **Catalog & relations**: `catalog_albums`, `catalog_artists`, `catalog_songs`,
  `album_tracks`, `artist_albums`, `artist_tracks`, `loved_songs`,
  `scrobble_feed`, `scrobble` (single by uri), `follows`, `followers`,
  `known_followers`.
- **Detail / long-tail (raw JSON)**: `album`, `artist`, `song`, `playlists`,
  `playlist`, `stats`, `wrapped`, `scrobbles_chart`, `recommendations`,
  `neighbours`, `shouts`, and more.

### Date-window charts

`top_tracks_interval` / `top_artists_interval` take a typed `DateInterval` —
`AllTime`, `LastDays(n)`, `LastWeeks(n)`, `LastMonths(n)`, `LastYears(n)`, or
`Range { start, end }`. Plain `top_tracks` / `top_artists` are all-time shorthands.

```rust
async fn run(av: rocksky_sdk::AppView) -> rocksky_sdk::Result<()> {
  use rocksky_sdk::DateInterval;

  let last_year = av.top_artists_interval(DateInterval::LastYears(1), 50, 0).await?;
  let window    = av.top_tracks_interval(
    DateInterval::Range { start: "2025-01-01".into(), end: "2025-06-30".into() },
    50, 0,
  ).await?;
  let _ = (last_year, window);
  Ok(()) 
}
```

### `match_song` & the escape hatch

`match_song(title, artist, mb_id, isrc)` resolves a bare title + artist into full
canonical metadata (album, artwork, duration, track/disc number, MBID, ISRC,
streaming links) as raw JSON. `get(nsid, &params)` calls any read query by nsid
and returns raw `serde_json::Value` — every named method above is sugar over it.
Attach an optional bearer token for auth-gated queries with
`AppView::new(base).with_token(token)` (or `set_token`); it is sent as
`Authorization: Bearer <token>`.

## Feature flags

| Feature     | Default | Enables                                              |
| ----------- | ------- | ---------------------------------------------------- |
| `oauth`     | yes     | Browser + loopback OAuth login                       |
| `dns`       | yes     | DNS-based handle resolution                          |
| `appview`   | yes     | The unauthenticated public-read `AppView` client     |
| `dedup`     | no      | RocksDB duplicate-prevention index (repo CAR mirror) |
| `jetstream` | no      | Live index hydration from the Jetstream firehose (implies `dedup`) |

## Regenerating the lexicon bindings

The typed `app.rocksky.*` records under `src/app_rocksky` (plus the referenced
`src/com_atproto` and `src/app_bsky` modules) are generated from
`apps/api/lexicons/` by [`jacquard-codegen`](https://crates.io/crates/jacquard-lexgen):

```sh
cargo install jacquard-lexgen   # provides `jacquard-codegen`
./scripts/gen-lexicons.sh
```

## License

MIT
