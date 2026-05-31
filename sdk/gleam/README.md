# rocksky — Gleam SDK for the Rocksky XRPC API

A pipe-friendly, batteries-included Gleam client for the
[Rocksky](https://rocksky.app) XRPC API, generated from the lexicons in
[`apps/api/lexicons`](../../apps/api/lexicons).

```sh
gleam add rocksky
```

## At a glance

Every endpoint returns a `rocksky.Request(a)`. Refine it with chainable
helpers, then `send` it through a `Client`:

```gleam
import gleam/io
import gleam/option
import rocksky
import rocksky/actor
import rocksky/scrobble

pub fn main() {
  let client =
    rocksky.new()
    |> rocksky.with_bearer_token("xxx")

  // GET app.rocksky.actor.getProfile
  let assert Ok(profile) =
    actor.get_profile(did: "alice.bsky.social")
    |> rocksky.send(client)
  io.println("Hello, " <> option.unwrap(profile.handle, "unknown") <> "!")

  // Optional params chain naturally — no Some/None at the call site.
  let assert Ok(scrobbles) =
    actor.get_actor_scrobbles(did: "alice.bsky.social")
    |> rocksky.limit(50)
    |> rocksky.offset(0)
    |> rocksky.send(client)

  // Procedures with rich bodies use a typed builder, ending in `create`:
  let _ =
    scrobble.new_scrobble(title: "Karma Police", artist: "Radiohead")
    |> scrobble.with_album("OK Computer")
    |> scrobble.with_duration_ms(263_000)
    |> scrobble.create
    |> rocksky.send(client)
}
```

## Design

- **One `Client`, one pipe.** Build the client once, then every call reads as
  `endpoint(...) |> rocksky.<param>(...) |> ... |> rocksky.send(client)`.
- **No `Option(_)` at the call site.** Required params land in the endpoint
  constructor; optional params are added by chaining functions on the
  `Request(a)` value. Skip them by simply not piping them.
- **Builders for body-heavy procedures.** `scrobble.create`, `song.create`,
  `shout.create`, etc. accept a typed builder (`NewScrobble`, `NewSong`) that
  flows through `with_*` setters before becoming a `Request`.
- **`Request(a)` is just data.** It carries the method, params, headers, body
  and decoder. You can pass it around, decorate it (`rocksky.header` for
  per-request headers), and only at `send` does the network happen.
- **Errors are explicit.** `RocksyError` distinguishes transport errors,
  XRPC errors, raw HTTP failures, and decode failures.
- **Swappable transport.** `rocksky.with_send` lets you plug in your own
  HTTP function (great for tests; required if you target JavaScript).

## Configuration

```gleam
let client =
  rocksky.new()
  |> rocksky.with_base_url("https://api.rocksky.app")   // default
  |> rocksky.with_bearer_token("xxx")
  |> rocksky.with_user_agent("my-app/1.0")
  |> rocksky.with_header("x-trace-id", "abc123")
```

## Builder vocabulary

These chainable helpers live in the `rocksky` module and work on any
`Request(a)`:

| Function                            | XRPC parameter      |
| ----------------------------------- | ------------------- |
| `rocksky.limit(n)`                  | `limit`             |
| `rocksky.offset(n)`                 | `offset`            |
| `rocksky.cursor(c)`                 | `cursor`            |
| `rocksky.start_date(d)`             | `startDate`         |
| `rocksky.end_date(d)`               | `endDate`           |
| `rocksky.genre(g)`                  | `genre`             |
| `rocksky.year(y)`                   | `year`              |
| `rocksky.size(n)`                   | `size`              |
| `rocksky.param(name, value)`        | arbitrary string    |
| `rocksky.int_param(name, value)`    | arbitrary int       |
| `rocksky.bool_param(name, value)`   | arbitrary bool      |
| `rocksky.repeated_param(name, vs)`  | array (repeats key) |
| `rocksky.header(name, value)`       | per-request header  |

Namespace-specific params (e.g. `charts.with_artist_uri`, `graph.with_dids`,
`player.with_player_id`) live in their own module so the global vocabulary
stays small.

## Endpoint modules

The SDK mirrors the lexicon namespaces. Each module hosts the queries and
procedures under `app.rocksky.<namespace>`:

| Module               | Lexicon namespace            |
| -------------------- | ---------------------------- |
| `rocksky/actor`      | `app.rocksky.actor.*`        |
| `rocksky/album`      | `app.rocksky.album.*`        |
| `rocksky/apikey`     | `app.rocksky.apikey.*`       |
| `rocksky/artist`     | `app.rocksky.artist.*`       |
| `rocksky/charts`     | `app.rocksky.charts.*`       |
| `rocksky/dropbox`    | `app.rocksky.dropbox.*`      |
| `rocksky/feed`       | `app.rocksky.feed.*`         |
| `rocksky/googledrive`| `app.rocksky.googledrive.*`  |
| `rocksky/graph`      | `app.rocksky.graph.*`        |
| `rocksky/like`       | `app.rocksky.like.*`         |
| `rocksky/mirror`     | `app.rocksky.mirror.*`       |
| `rocksky/player`     | `app.rocksky.player.*`       |
| `rocksky/playlist`   | `app.rocksky.playlist.*`     |
| `rocksky/scrobble`   | `app.rocksky.scrobble.*`     |
| `rocksky/shout`      | `app.rocksky.shout.*`        |
| `rocksky/song`       | `app.rocksky.song.*`         |
| `rocksky/spotify`    | `app.rocksky.spotify.*`      |
| `rocksky/stats`      | `app.rocksky.stats.*`        |

## Decoding `Dynamic` responses

Common views (`Profile`, `Artist`, `Album`, `Song`, `Scrobble`, `Stats`,
`Listener`, `Shout`, `ApiKey`) are typed in `rocksky/types`. For inline,
anonymous JSON objects (e.g. feed search, chart shapes) the SDK types the
response as `Dynamic` so you can decode it on your terms:

```gleam
import gleam/dynamic/decode
import rocksky
import rocksky/decoders
import rocksky/feed

let assert Ok(payload) =
  feed.search(q: "radiohead") |> rocksky.send(client)

let result_decoder = {
  use artists <- decode.optional_field("artists", [], decode.list(decoders.artist()))
  use songs <- decode.optional_field("songs", [], decode.list(decoders.song()))
  decode.success(#(artists, songs))
}

let assert Ok(#(artists, songs)) = decode.run(payload, result_decoder)
```

## Error handling

```gleam
import rocksky/error

let result =
  actor.get_profile(did: "garbage") |> rocksky.send(client)

case result {
  Ok(p) -> // ...
  Error(error.XrpcError(status: _, name: "InvalidRequest", message: m)) ->
    // Server told us why
  Error(error.TransportError(_)) ->
    // DNS, TLS, etc.
  Error(error.HttpStatusError(status: _, body: _)) ->
    // Non-XRPC 4xx/5xx
  Error(error.DecodeError(_)) ->
    // Server returned JSON we didn't expect
  Error(error.InvalidInput(_)) ->
    // Caught client-side before sending
}
```

## Reaching un-surfaced XRPC methods

If the SDK is missing an endpoint, drop down to the underlying constructors:

```gleam
import gleam/dynamic/decode

let _ =
  rocksky.query("app.rocksky.some.newEndpoint", decode.dynamic)
  |> rocksky.param("foo", "bar")
  |> rocksky.send(client)
```

## Examples

Runnable examples live under [`src/examples/`](./src/examples) so they are
compile-checked against the SDK on every `gleam build`. Run any of them with
`gleam run -m examples/<name>`:

- [`profile.gleam`](./src/examples/profile.gleam) — fetch a profile and print it
- [`scrobble.gleam`](./src/examples/scrobble.gleam) — record a play (builder)
- [`paginate_scrobbles.gleam`](./src/examples/paginate_scrobbles.gleam) — walk
  a user's scrobble history in pages
- [`search.gleam`](./src/examples/search.gleam) — search and decode results
- [`wrapped.gleam`](./src/examples/wrapped.gleam) — fetch year-in-review stats
- [`custom_transport.gleam`](./src/examples/custom_transport.gleam) — swap
  the HTTP backend (for tests / JS targets)

## Testing

```sh
gleam test
```

The SDK is built around an injectable transport, so unit tests don't need a
network. See `test/rocksky/client_test.gleam` for the mock-send pattern.

## License

MIT.
