module Production where

import Prelude
import Data.Argonaut.Core (stringify)
import Data.Argonaut.Encode (encodeJson)
import Data.Array (find)
import Data.Maybe (Maybe)
import Data.Tuple (Tuple(..))
import Foreign.Object as Object

type Service = { name :: String, units :: Array String, paths :: Array String }

-- Audited against production on 2026-10-27. APIs and feeds run Gleam.
-- Rust AppView and the retired API/feeds units are deliberately not targets.
services :: Array Service
services =
  [ { name: "rockskyd", units: ["rocksky-jetstream.service", "rocksky-scrobbler.service", "rocksky-spotify.service", "rocksky-webscrobbler.service", "rocksky-navidrome.service", "rocksky-matching.service", "rocksky-jellyfin.service", "rocksky-mirror.service", "rocksky-submissions.service"], paths: ["crates/**", "Cargo.toml", "Cargo.lock", ".dagger/rust/**", ".dagger/ops/**", ".dagger/sdk/**", ".github/actions/dagger/**", "dagger.toml", "dagger.lock", ".github/workflows/build.yml"] },
  { name: "gleam", units: ["rocksky-gleam.service", "rocksky-gleam-xrpc.service", "rocksky-gleam-views.service", "feeds-gleam.service"], paths: ["gleam/**", "crates/analysis-node/**", "crates/analysis/**", "crates/db/**", "Cargo.toml", "Cargo.lock", "apps/api/**", "sdk/typescript/**", "package.json", "bun.lock", "patches/**", ".dagger/ops/**", ".dagger/sdk/**", ".github/actions/dagger/**", "dagger.toml", "dagger.lock", ".github/workflows/build.yml"] },
  { name: "embed", units: ["rocksky-embed.service"], paths: ["apps/embed/**", "package.json", "bun.lock", "patches/**", ".dagger/ops/**", ".dagger/sdk/**", ".github/actions/dagger/**", "dagger.toml", "dagger.lock", ".github/workflows/build.yml"] },
  { name: "ws", units: ["rocksky-ws.service"], paths: ["apps/ws/**", ".dagger/ops/**", ".dagger/sdk/**", ".github/actions/dagger/**", "dagger.toml", "dagger.lock", ".github/workflows/build.yml"] },
  { name: "mb", units: ["rocksky-mb.service"], paths: ["musicbrainz/**", "package.json", "bun.lock", "patches/**", ".dagger/ops/**", ".dagger/sdk/**", ".github/actions/dagger/**", "dagger.toml", "dagger.lock", ".github/workflows/build.yml"] },
  { name: "deezer", units: ["rocksky-deezer.service"], paths: ["deezer/**", "package.json", "bun.lock", "patches/**", ".dagger/ops/**", ".dagger/sdk/**", ".github/actions/dagger/**", "dagger.toml", "dagger.lock", ".github/workflows/build.yml"] },
  { name: "discogs", units: ["rocksky-discogs.service"], paths: ["discogs/**", "package.json", "bun.lock", "patches/**", ".dagger/ops/**", ".dagger/sdk/**", ".github/actions/dagger/**", "dagger.toml", "dagger.lock", ".github/workflows/build.yml"] },
  { name: "spotifyProxy", units: ["rocksky-spotify-proxy.service"], paths: ["spotify/**", "package.json", "bun.lock", "patches/**", ".dagger/ops/**", ".dagger/sdk/**", ".github/actions/dagger/**", "dagger.toml", "dagger.lock", ".github/workflows/build.yml"] },
  { name: "remoteWs", units: ["rocksky-remote-ws.service"], paths: ["remote-ws/**", ".dagger/ops/**", ".dagger/sdk/**", ".github/actions/dagger/**", "dagger.toml", "dagger.lock", ".github/workflows/build.yml"] },
  { name: "riff", units: ["rocksky-riff.service", "rocksky-riff-mb.service"], paths: ["riff/**", ".dagger/ops/**", ".dagger/sdk/**", ".github/actions/dagger/**", "dagger.toml", "dagger.lock", ".github/workflows/build.yml"] },
  { name: "drift", units: ["rocksky-drift.service"], paths: ["drift/**", ".dagger/ops/**", ".dagger/sdk/**", ".github/actions/dagger/**", "dagger.toml", "dagger.lock", ".github/workflows/build.yml"] },
  { name: "abuseSweep", units: ["rocksky-scrobble-abuse-sweep.service"], paths: ["apps/scrobble-abuse-sweep/**", ".dagger/ops/**", ".dagger/sdk/**", ".github/actions/dagger/**", "dagger.toml", "dagger.lock", ".github/workflows/build.yml"] }
  ]

lookup :: String -> Maybe Service
lookup name = find (\service -> service.name == name) services

filters :: String
filters = stringify $ encodeJson $ Object.fromFoldable $
  map (\service -> Tuple service.name service.paths) services
