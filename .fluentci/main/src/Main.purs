module Main where

import Prelude
import CI.Runtime as CI
import CI.Docker.Engine as Engine
import CI.Module as M
import CI.Docker.Types (Client, Directory(..))
import Effect (Effect)
import Rocksky.CI.Go as Go
import Rocksky.CI.Typescript as Typescript
import Rocksky.CI.Rust as Rust
import Rocksky.CI.Elixir as Elixir

runChecks :: Client -> String -> Effect String
runChecks client source = do
  let at path = HostDirectory (Engine.absolute client source <> "/" <> path)
  void $ Go.sdk client (at "sdk/go")
  void $ Go.deezer client { source: at "deezer", otel: at "otel" }
  void $ Go.musicbrainz client { source: at "musicbrainz", otel: at "otel" }
  void $ Typescript.sdk client (at "sdk/typescript")
  void $ Typescript.cli client (at "apps/cli")
  void $ Typescript.apiContracts client (at ".")
  void $ Rust.sdk client (at "sdk/rust")
  void $ Rust.tracklist client (at ".")
  void $ Rust.matching client (at ".")
  void $ Rust.submissions client (at ".")
  void $ Rust.riff client (at "riff")
  void $ Elixir.remoteWs client (at "remote-ws")
  pure "All portable CI checks passed"

checks :: Effect Unit
checks = CI.runModule
  [ M.object_ "RockskyCI" {}
      [ M.function "checks" "Run every portable test job." (M.defaultArgument "source" ".") runChecks ]
  ] "checks"

build :: Effect Unit
build = CI.runModule
  [ M.object_ "RockskyCI" {}
      [ M.function "build" "Build production daemon and submissions artifacts." (M.argument "source") Rust.productionBinaries ]
  ] "build"
