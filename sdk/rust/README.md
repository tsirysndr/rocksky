# rocksky — Rust SDK

Async Rust SDK for the [Rocksky](https://rocksky.app) XRPC API.

- **Async-first** — built on `tokio` + `reqwest`
- **Typed** — strongly typed `serde` models, snake_case API
- **Builder-friendly** — every list/paginated endpoint and every multi-field
  request is a fluent builder (`.limit(10).offset(0).send().await`)
- **Idiomatic** — namespaced accessors: `client.actor()`, `client.scrobble()`, …
- **Escape hatch** — `client.call()` / `client.procedure()` for any XRPC method
  not yet wrapped
- **Pipe-friendly** — every response round-trips through `serde_json`, so you
  can stream results straight to `stdout` or shell pipelines (`jq`, etc.)
- Compiles on **Rust 1.75+**

## Install

```toml
[dependencies]
rocksky = "0.1"
tokio = { version = "1", features = ["macros", "rt-multi-thread"] }
```

Pin TLS backend if you don't want `rustls` (the default):

```toml
rocksky = { version = "0.1", default-features = false, features = ["native-tls"] }
```

## Quickstart

```rust
use rocksky::Client;

#[tokio::main]
async fn main() -> rocksky::Result<()> {
    let client = Client::new();

    let me = client.actor().get_profile("tsiry-sandratraina.com").await?;
    println!("{} — {}",
        me.display_name.as_deref().unwrap_or(""),
        me.did.as_deref().unwrap_or(""));

    let scrobbles = client
        .scrobble()
        .list()
        .did(me.did.clone().unwrap_or_default())
        .limit(10)
        .send()
        .await?;
    for s in scrobbles {
        println!("  {} — {}",
            s.artist.as_deref().unwrap_or("?"),
            s.title.as_deref().unwrap_or("?"));
    }
    Ok(())
}
```

### Authenticating

Pass a bearer token at construction time:

```rust
let client = rocksky::Client::builder()
    .token("eyJhbGciOi…")
    .build();
```

…or change it later:

```rust
client.set_token(Some("new-token".into())).await;
```

### Self-hosting / custom base URL

Default is `https://api.rocksky.app`:

```rust
let client = rocksky::Client::builder()
    .base_url("http://localhost:8000")
    .token(token)
    .timeout(std::time::Duration::from_secs(10))
    .build();
```

## Builders everywhere

The fluent style maps every optional field to a chainable method, then calls
`.send()` to dispatch:

```rust
// List builder
let songs = client.actor().get_songs("did:plc:7vdlgi2bflelz7mmuxoqjfcr")
    .limit(50)
    .offset(0)
    .start_date(chrono::Utc::now() - chrono::Duration::days(30))
    .send().await?;

// Mutation builder (only the required args are positional)
let _ = client.scrobble().create("Hounds of Love", "Kate Bush")
    .album("Hounds of Love")
    .duration(298_000)
    .year(1985)
    .send().await?;

// Charts
let top = client.charts().top_tracks()
    .limit(100)
    .send().await?;
```

## Resources

| Namespace | Accessor | Methods (selected) |
|-----------|----------|--------------------|
| `app.rocksky.actor` | `client.actor()` | `get_profile`, `get_profile_me`, `get_albums`, `get_artists`, `get_songs`, `get_scrobbles`, `get_loved_songs`, `get_playlists`, `get_neighbours`, `get_compatibility` |
| `app.rocksky.album` | `client.album()` | `get`, `list`, `get_tracks` |
| `app.rocksky.artist` | `client.artist()` | `get`, `list`, `get_albums`, `get_tracks`, `get_listeners`, `get_recent_listeners` |
| `app.rocksky.song` | `client.song()` | `get`, `get_by_mbid`, `get_by_isrc`, `get_by_spotify_id`, `list`, `match_song`, `get_recent_listeners`, `create` |
| `app.rocksky.scrobble` | `client.scrobble()` | `get`, `list`, `create` |
| `app.rocksky.charts` | `client.charts()` | `top_tracks`, `top_artists`, `scrobbles_chart` |
| `app.rocksky.feed` | `client.feed()` | `get`, `search`, `stories`, `recommendations`, `artist_recommendations`, `album_recommendations`, `get_generator`, `list_generators` |
| `app.rocksky.graph` | `client.graph()` | `follow`, `unfollow`, `get_followers`, `get_follows`, `get_known_followers` |
| `app.rocksky.shout` | `client.shout()` | `create`, `reply`, `remove`, `report`, `for_profile`, `for_album`, `for_artist`, `for_track`, `replies` |
| `app.rocksky.like` | `client.like()` | `like_song`, `dislike_song`, `like_shout`, `dislike_shout` |
| `app.rocksky.playlist` | `client.playlist()` | `get`, `list`, `create`, `remove`, `start`, `insert_files`, `insert_directory` |
| `app.rocksky.player` | `client.player()` | `currently_playing`, `queue`, `play`, `pause`, `next`, `previous`, `seek`, `play_file`, `play_directory`, `add_items_to_queue` |
| `app.rocksky.spotify` | `client.spotify()` | `currently_playing`, `play`, `pause`, `next`, `previous`, `seek` |
| `app.rocksky.apikey` | `client.apikey()` | `list`, `create`, `update`, `remove` |
| `app.rocksky.stats` | `client.stats()` | `get`, `wrapped` |
| `app.rocksky.mirror` | `client.mirror()` | `list_sources`, `put_source` |
| `app.rocksky.dropbox` | `client.dropbox()` | `list_files`, `metadata`, `temporary_link`, `download_file` |
| `app.rocksky.googledrive` | `client.googledrive()` | `list_files`, `get_file`, `download_file` |

For methods that aren't typed yet, drop down to the generic escape hatch:

```rust
let raw: serde_json::Value =
    client.call("app.rocksky.feed.describeFeedGenerator").await?;
```

## Errors

All fallible methods return `Result<T, rocksky::Error>`. The `Error` enum
carries the full server response when the API returns a non-2xx:

```rust
use rocksky::Error;

match client.song().get("at://does-not-exist").await {
    Ok(song) => println!("{song:?}"),
    Err(e) if e.is_not_found() => eprintln!("not found"),
    Err(Error::Api { status, error, message, .. }) => {
        eprintln!("api error {status}: {error:?} / {message:?}");
    }
    Err(Error::MissingToken { method }) => {
        eprintln!("auth required for {method}");
    }
    Err(e) => return Err(e.into()),
}
```

Convenience predicates: `is_unauthorized()`, `is_forbidden()`,
`is_not_found()`, `is_rate_limited()`, `is_client_error()`, `is_server_error()`.

## Pipe-friendly CLI use

The included `search` example streams hits as one JSON object per line —
drop-in for `jq`:

```bash
cargo run --example search -- "kate bush" \
    | jq -c '{type: .type, title: (.title // .name)}'
```

## Examples

Runnable examples live in [`examples/`](examples/):

- `examples/quickstart.rs` — fetch a profile and recent scrobbles
- `examples/scrobble.rs` — submit a scrobble (needs `ROCKSKY_TOKEN`)
- `examples/wrapped.rs` — print a user's year-in-review JSON
- `examples/search.rs` — search + line-delimited JSON output
- `examples/follow_feed.rs` — page through the follow-graph feed

Run with:

```bash
cargo run --example quickstart -- tsiry-sandratraina.com
```

## Testing your own code against the SDK

Provide your own `reqwest::Client` and point the SDK at a mock server.
The SDK's own test suite uses [`wiremock`](https://docs.rs/wiremock):

```rust
use wiremock::{Mock, ResponseTemplate};
use wiremock::matchers::{method, path};

#[tokio::test]
async fn it_works() {
    let server = wiremock::MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/xrpc/app.rocksky.feed.search"))
        .respond_with(ResponseTemplate::new(200)
            .set_body_json(serde_json::json!({"hits": []})))
        .mount(&server).await;

    let client = rocksky::Client::builder().base_url(server.uri()).build();
    let results = client.feed().search("kate bush").await.unwrap();
    assert!(results.hits.is_empty());
}
```

## Development

```bash
cargo build
cargo test
cargo doc --open
```

## License

[MIT](LICENSE) © Tsiry Sandratraina.
