# Rocksky PureScript SDK

A PureScript client for Rocksky's XRPC API, initialized with Spago. Includes
149 generated query/procedure modules, shared response types, authenticated
requests, cancellation, timeouts, and structured errors. Uses native `fetch`
in Node.js 22+ and modern browsers; no runtime npm dependencies.

## Development

From `sdk/purescript`:

```sh
npm install
npm run build
npm test
```

The toolchain is pinned to PureScript 0.15.16, Spago 1.0.5, and registry package
set 81.5.0. Commit `spago.lock` when changing PureScript dependencies. Spago
initialization and package configuration follow the [Spago documentation](https://github.com/purescript/spago).

This package has not been published to the PureScript registry. To use it in
another local Spago workspace, add it as a local package:

```yaml
workspace:
  extraPackages:
    rocksky-sdk:
      path: /path/to/rocksky/sdk/purescript
```

Then run `spago install rocksky-sdk` in that workspace. Browser applications
should bundle the generated JavaScript with their usual bundler; browser
requests are subject to the target server's CORS policy.

## Read a profile

```purescript
module Main where

import Prelude
import Data.Either (Either(..))
import Data.Maybe (Maybe(..))
import Effect (Effect)
import Effect.Aff (launchAff_)
import Effect.Class (liftEffect)
import Effect.Console (log)
import Rocksky (defaultConfig, newClient)
import Rocksky.API.Actor.GetProfile as Profile

main :: Effect Unit
main = launchAff_ do
  let client = newClient defaultConfig
  result <- Profile.call client
    ((Profile.defaultParams {}) { did = Just "alice.bsky.social" })
  liftEffect case result of
    Left err -> log (show err)
    Right profile -> log (show profile.displayName)
```

Every endpoint module exports `Params`, `Output`, `nsid`, and `call`.
JSON procedures also export `Input`. `defaultParams` and `defaultInput` take a
record of required fields and fill optional fields with `Nothing`. Endpoints
with no required parameters use `defaultParams {}` (or simply `{}` when there
are no parameters at all).

## Authenticated writes

Supply an existing Rocksky bearer token. Tokens are attached only to requests
made by that client; there is no global mutable session.

```purescript
import Rocksky (defaultConfig, newClient, withToken)
import Rocksky.API.Scrobble.CreateScrobble as Scrobble
import Rocksky.API.Playlist.CreatePlaylist as Playlist

-- Inside an Aff block:
let client = withToken accessToken (newClient defaultConfig)
scrobble <- Scrobble.call client {}
  (Scrobble.defaultInput { title: "One More Time", artist: "Daft Punk" })
playlist <- Playlist.call client
  (Playlist.defaultParams { name: "Favorites" })
```

The generated signatures follow the lexicons: some procedures, including
`createPlaylist`, send arguments in the query string and have no JSON body.
Optional input fields set to `Nothing` are omitted, including nested fields.
Required nullable fields preserve null. Raw JSON requests preserve their body
exactly, including explicit nulls.

## Configuration and errors

```purescript
let client = newClient
      (defaultConfig
        { baseUrl = "https://api.rocksky.app"
        , token = Just accessToken
        , timeoutMs = 15000
        })
```

Calls return `Aff (Either RockskyError output)`:

- `TransportError String`: network failure, timeout, or invalid request configuration.
- `ResponseError { status, error, message, body }`: non-2xx HTTP response, with
  the original body retained even when it is not JSON.
- `DecodeError String`: malformed JSON or a response that fails typed decoding.

Cancellation of the `Aff` aborts the underlying HTTP request. The timeout
covers both fetching headers and consuming the response body. Requests do not
follow redirects, and the SDK does not automatically retry writes. Query
arrays become repeated parameters; `Nothing` is omitted, while `false`, zero,
and empty strings are preserved.

## API coverage

Modules follow the NSID namespace and method, for example:

| NSID | Module |
| --- | --- |
| `app.rocksky.actor.getProfile` | `Rocksky.API.Actor.GetProfile` |
| `app.rocksky.scrobble.getScrobbles` | `Rocksky.API.Scrobble.GetScrobbles` |
| `app.rocksky.song.getSongs` | `Rocksky.API.Song.GetSongs` |
| `app.rocksky.charts.getTopTracks` | `Rocksky.API.Charts.GetTopTracks` |
| `app.rocksky.stats.getGlobalStats` | `Rocksky.API.Stats.GetGlobalStats` |
| `app.rocksky.library.getSong` | `Rocksky.API.Library.GetSong` |

The catalog also includes albums, artists, playlists, feeds, graphs, shouts,
notifications, events, player controls, equalizer settings, and more.

`Rocksky.query` and `Rocksky.procedure` provide generic typed calls for new
endpoints; `Rocksky.request` takes and returns raw `Json` and allows a body to
be omitted explicitly. Empty successful responses decode as JSON null.

Types reflect the checked-in lexicons, including their optional response
fields. Integers use `Number` to preserve JavaScript-safe integer values such
as timestamps and large counters beyond PureScript's 32-bit `Int` range.
Callers must supply integral values for integer fields. String formats,
enums, and numeric bounds are validated by the server, not by this SDK.
Open unions, unknown values, blobs, and recursive reference edges use `Json`.
Additional response fields are ignored by typed decoding; use raw calls when
those fields are needed.

This is an HTTP SDK for the Rocksky AppView. OAuth login/session refresh,
direct AT Protocol PDS writes, local deduplication, Jetstream subscriptions,
and remote-player WebSocket sessions are not implemented here.

## Regenerating the API

```sh
npm run generate
npm run build
npm test
```

Generation requires Python 3, purs-tidy, and the monorepo's
`apps/api/lexicons/**/*.json`. Generated sources are checked in, so consumers
do not need the generator or the lexicons to build. The generator fails on
unresolved references or unsupported schema types. Handwritten transport
code lives in `src/Rocksky/Client.*`; generated endpoints live in
`src/Rocksky/API/` and shared types in `src/Rocksky/Types.purs`.

Tests run against a local mock HTTP server and mocked fetch implementations;
they do not access a production account or submit real scrobbles.
