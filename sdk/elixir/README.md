# Rocksky — Elixir SDK
[![Package Version](https://img.shields.io/hexpm/v/rocksky_ex)](https://hex.pm/packages/rocksky_ex)

A pipe-friendly Elixir client for the [Rocksky](https://rocksky.app) XRPC API.

```elixir
def deps do
  [
    {:rocksky_ex, "~> 0.2"}
  ]
end
```

## Quick start

```elixir
client = Rocksky.new(token: System.get_env("ROCKSKY_TOKEN"))

{:ok, profile} =
  client
  |> Rocksky.Actor.get_profile(did: "did:plc:7vdlgi2bflelz7mmuxoqjfcr")

{:ok, %{"scrobbles" => scrobbles}} =
  client
  |> Rocksky.Actor.get_actor_scrobbles(did: "did:plc:7vdlgi2bflelz7mmuxoqjfcr", limit: 25)
```

The client is always the first argument so calls compose naturally with `|>`.
Every namespace module mirrors an XRPC NSID: `app.rocksky.actor.getProfile`
becomes `Rocksky.Actor.get_profile/2`, `app.rocksky.scrobble.createScrobble`
becomes `Rocksky.Scrobble.create_scrobble/2`, and so on.

## Configuring the client

```elixir
Rocksky.new(
  base_url: "https://api.rocksky.app",   # defaults to the public API
  token:    "your-bearer-token",         # required for authenticated procedures
  headers:  [{"x-app", "my-app"}],       # extra request headers
  req_options: [retry: false]            # forwarded to Req
)
```

You can also configure the default base URL globally:

```elixir
# config/config.exs
config :rocksky_ex, base_url: "https://api.rocksky.app"
```

Derive an authenticated client from a shared base:

```elixir
base = Rocksky.new()
authed = Rocksky.Client.with_token(base, "tok")
```

## Examples

### Create a scrobble

```elixir
client
|> Rocksky.Scrobble.create_scrobble(
  title:     "In Bloom",
  artist:    "Nirvana",
  album:     "Nevermind",
  timestamp: System.system_time(:second)
)
```

### Builder style

The SDK ships a chainable builder for every procedure with a JSON body. Each
builder validates required fields locally before hitting the network and gives
you autocompleteable setters per field:

| Builder                       | XRPC procedure                          |
| ----------------------------- | --------------------------------------- |
| `Rocksky.Scrobble.Builder`    | `app.rocksky.scrobble.createScrobble`   |
| `Rocksky.Song.Builder`        | `app.rocksky.song.createSong`           |
| `Rocksky.Mirror.Builder`      | `app.rocksky.mirror.putMirrorSource`    |
| `Rocksky.Apikey.Builder`      | `app.rocksky.apikey.createApikey`       |
| `Rocksky.Shout.ReplyBuilder`  | `app.rocksky.shout.replyShout`          |
| `Rocksky.Shout.ReportBuilder` | `app.rocksky.shout.reportShout`         |

```elixir
alias Rocksky.Scrobble.Builder, as: Scrobble

Scrobble.new(title: "In Bloom", artist: "Nirvana")
|> Scrobble.album("Nevermind")
|> Scrobble.album_art("https://...")
|> Scrobble.spotify_link("https://open.spotify.com/track/...")
|> Scrobble.timestamp(System.system_time(:second))
|> Scrobble.submit(client)
# => {:ok, %{...}}
```

```elixir
alias Rocksky.Song.Builder, as: Song

Song.new(title: "Lithium", artist: "Nirvana")
|> Song.album("Nevermind")
|> Song.isrc("USDW19811234")
|> Song.duration(257_000)
|> Song.submit(client)
```

Camel-cased lexicon keys (e.g. `albumArt`, `mbId`, `spotifyLink`) become
snake-cased setters (`album_art/2`, `mb_id/2`, `spotify_link/2`). `new/1`
and `put/2` accept either form:

```elixir
alias Rocksky.Mirror.Builder, as: Mirror

Mirror.new(provider: "lastfm", enabled: true, external_username: "alice")
|> Mirror.api_key("...")
|> Mirror.submit(client)
```

Use `put/2` to set several at once, and `to_body/1` to inspect the JSON body
without submitting:

```elixir
Scrobble.new(title: "x", artist: "y")
|> Scrobble.put(album: "Nevermind", year: 1991)
|> Scrobble.to_body()
# => %{title: "x", artist: "y", album: "Nevermind", year: 1991}
```

Missing required fields are caught locally:

```elixir
Scrobble.new(title: "Only title") |> Scrobble.submit(client)
# => {:error, %Rocksky.Error{reason: :missing_fields, body: %{missing: [:artist]}}}
```

Both styles coexist — use one-shot keyword lists when it fits, builders when
you're constructing the payload over several steps.

### Find a song

```elixir
{:ok, song} = Rocksky.Song.get_song(client, isrc: "USDW19811234")
{:ok, song} = Rocksky.Song.get_song(client, mbid: "f1234567-...")
{:ok, song} = Rocksky.Song.get_song(client, uri:  "at://did:plc:abc/app.rocksky.song/123")
```

### Charts

```elixir
client
|> Rocksky.Charts.get_top_tracks(limit: 10, startDate: "2026-01-01")
```

### Free-text search

```elixir
{:ok, results} = Rocksky.Feed.search(client, query: "nevermind")
```

### Follow / unfollow

```elixir
client |> Rocksky.Graph.follow_account(account: "alice.bsky.social")
client |> Rocksky.Graph.unfollow_account(account: "alice.bsky.social")
```

### Player remote-control

```elixir
client |> Rocksky.Player.play(playerId: id)
client |> Rocksky.Player.pause(playerId: id)
client |> Rocksky.Player.next(playerId: id)
client |> Rocksky.Player.seek(playerId: id, position: 60_000)
```

### Paginate with `Stream`

```elixir
Stream.unfold(0, fn offset ->
  case Rocksky.Actor.get_actor_scrobbles(client,
         did: "alice.bsky.social",
         limit: 50,
         offset: offset
       ) do
    {:ok, %{"scrobbles" => []}} -> nil
    {:ok, %{"scrobbles" => batch}} -> {batch, offset + length(batch)}
    {:error, _} -> nil
  end
end)
|> Stream.flat_map(& &1)
|> Enum.take(500)
```

See [`examples/`](./examples) for runnable scripts (`mix run examples/...`).

## Result shape and errors

Every function returns `{:ok, body}` on a 2xx response and
`{:error, %Rocksky.Error{}}` otherwise:

```elixir
case Rocksky.Song.get_song(client, uri: "at://missing") do
  {:ok, song} ->
    song

  {:error, %Rocksky.Error{status: 404}} ->
    :not_found

  {:error, %Rocksky.Error{reason: :unauthorized}} ->
    :reauth

  {:error, err} ->
    Logger.error("rocksky: #{Exception.message(err)}")
end
```

`%Rocksky.Error{}` is also an `Exception`, so it works with `raise/1`,
`Exception.message/1`, and `with`/pattern matching.

## Modules

| Module                 | NSID prefix                  |
| ---------------------- | ---------------------------- |
| `Rocksky.Actor`        | `app.rocksky.actor.*`        |
| `Rocksky.Album`        | `app.rocksky.album.*`        |
| `Rocksky.Apikey`       | `app.rocksky.apikey.*`       |
| `Rocksky.Artist`       | `app.rocksky.artist.*`       |
| `Rocksky.Charts`       | `app.rocksky.charts.*`       |
| `Rocksky.Dropbox`      | `app.rocksky.dropbox.*`      |
| `Rocksky.Feed`         | `app.rocksky.feed.*`         |
| `Rocksky.GoogleDrive`  | `app.rocksky.googledrive.*`  |
| `Rocksky.Graph`        | `app.rocksky.graph.*`        |
| `Rocksky.Like`         | `app.rocksky.like.*`         |
| `Rocksky.Mirror`       | `app.rocksky.mirror.*`       |
| `Rocksky.Player`       | `app.rocksky.player.*`       |
| `Rocksky.Playlist`     | `app.rocksky.playlist.*`     |
| `Rocksky.Scrobble`     | `app.rocksky.scrobble.*`     |
| `Rocksky.Shout`        | `app.rocksky.shout.*`        |
| `Rocksky.Song`         | `app.rocksky.song.*`         |
| `Rocksky.Spotify`      | `app.rocksky.spotify.*`      |
| `Rocksky.Stats`        | `app.rocksky.stats.*`        |

If you need an NSID we haven't wrapped yet you can always drop down to
`Rocksky.HTTP.query/3` and `Rocksky.HTTP.procedure/4`:

```elixir
Rocksky.HTTP.query(client, "app.rocksky.actor.getProfile", did: "alice")
```

## Types

Lexicon-derived structs are available under `Rocksky.Generated.*`, mirroring every lex `*View*` / `*Record` / `*Input` / `*Output` / `*Params` shape from [the Rocksky lexicons](https://tangled.org/rocksky.app/rocksky/tree/main/apps/api/lexicons). Regenerate with `bun run lexgen:types` at the repo root.


## Testing your own code

The SDK routes every request through `Req`, which means you can stub it with
[`Req.Test`](https://hexdocs.pm/req/Req.Test.html) — no extra mock dependency
required:

```elixir
client =
  Rocksky.new(
    base_url: "https://api.test.rocksky.app",
    req_options: [plug: {Req.Test, MyApp.RockskyStub}]
  )

Req.Test.stub(MyApp.RockskyStub, fn conn ->
  Req.Test.json(conn, %{"handle" => "alice"})
end)

{:ok, %{"handle" => "alice"}} = Rocksky.Actor.get_profile(client, did: "alice")
```

## License

[MIT](LICENSE) © Tsiry Sandratraina.
