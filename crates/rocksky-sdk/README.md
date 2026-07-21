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
# async fn run() -> rocksky_sdk::Result<()> {
let av = rocksky_sdk::AppView::new("https://api.rocksky.app");
let charts = av.top_tracks(50, 0).await?;
let stats  = av.global_stats().await?;
# let _ = (charts, stats);
# Ok(()) }
```

## Convenience verbs

| Verb                                   | Record(s)                     |
| -------------------------------------- | ----------------------------- |
| `scrobble(draft)` → `ScrobbleResult`   | fans out to **artist + album + song + scrobble** (duplicates skipped) |
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
# async fn run() -> rocksky_sdk::Result<()> {
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
# Ok(()) }
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
# #[cfg(feature = "jetstream")]
# async fn run(agent: rocksky_sdk::RockskyAgent) -> rocksky_sdk::Result<()> {
agent.sync_repo().await?;                 // one-time backfill

// Run the live tail on a background task (reconnects + resumes forever).
let bg = agent.clone();
tokio::spawn(async move { bg.hydrate_from_jetstream().await });
# Ok(()) }
```

The servers are fully overridable via `JetstreamConfig`:

```rust
# #[cfg(feature = "jetstream")]
# async fn run(agent: rocksky_sdk::RockskyAgent) -> rocksky_sdk::Result<()> {
use rocksky_sdk::JetstreamConfig;

let config = JetstreamConfig::with_servers([
    "wss://my-jetstream.internal",
    "wss://jetstream1.us-west.bsky.network",
]);
agent.hydrate_from_jetstream_with(config).await?;
# Ok(()) }
```

All logging is via `tracing` — no stdout/stderr writes.

## AppView reads

`profile`, `scrobbles`, `songs`, `albums`, `artists`, `feed`, `search`,
`top_artists`, `top_tracks`, `global_stats`.

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

MPL-2.0. See the repository root `LICENSE`.
