module Main where

import Prelude
import CI.Runtime as CI
import Dagger (Client)
import Dagger.Container as Container
import Dagger.Modules as Module
import Dagger.Query as Query
import Dagger.Types (Container, Directory)
import Data.Maybe (Maybe(..))
import Effect (Effect)
import Effect.Aff (Aff)

-- Keep stable Rust, matching the existing GitHub toolchain policy.
rust :: Client -> String -> Container
rust client project = Query.container client
  # Container.from "rust:bookworm"
  # Container.withMountedCache "/usr/local/cargo/registry" (Query.cacheVolume "rocksky-cargo-registry" client)
  # Container.withMountedCache "/usr/local/cargo/git" (Query.cacheVolume "rocksky-cargo-git" client)
  # Container.withMountedCache "/src/target" (Query.cacheVolume ("rocksky-rust-" <> project) client)
  # Container.withWorkdir "/src"

sdk :: Client -> Directory -> Aff String
sdk client source = do
  void $ Container.sync $ rust client "sdk"
    # Container.withDirectoryWith "/src" source
        (Container.defaultWithDirectoryOpts
          { exclude = Just [ "target", ".git", ".env", ".env.*" ] })
    # Container.withExec [ "cargo", "test" ]
  pure "Rust SDK tests passed"

tracklist :: Client -> Directory -> Aff String
tracklist client source = do
  let
    redis = Query.container client
      # Container.from "redis:7-alpine"
      # Container.withExposedPort 6379
      # Container.asService
    environment = rust client "tracklist"
      # Container.withExec [ "sh", "-c", "apt-get update && apt-get install -y --no-install-recommends libreadline-dev pkg-config flex bison build-essential && rm -rf /var/lib/apt/lists/*" ]
      # Container.withExec [ "rustup", "component", "add", "rustfmt" ]
      -- Cargo needs every workspace member's manifest even for a single package.
      # Container.withDirectoryWith "/src" source
          (Container.defaultWithDirectoryOpts
            { include = Just [ "Cargo.toml", "Cargo.lock", "crates/**" ]
            , exclude = Just [ "**/target", "**/.env", "**/.env.*" ]
            })
      # Container.withExec [ "cargo", "fmt", "--all", "--check" ]
      # Container.withServiceBinding "redis" redis
      # Container.withEnvVariable "REDIS_URL" "redis://redis:6379"
      # Container.withExec [ "cargo", "test", "-p", "rocksky-tracklist" ]
  void $ Container.sync environment
  pure "Workspace formatting and tracklist tests passed"

matching :: Client -> Directory -> Aff String
matching client source = do
  void $ Container.sync $ rust client "matching"
    # Container.withDirectoryWith "/src" source
        (Container.defaultWithDirectoryOpts
          { include = Just [ "Cargo.toml", "Cargo.lock", "crates/**" ]
          , exclude = Just [ "**/target", "**/.env", "**/.env.*" ]
          })
    -- The script preserves release mode, --locked, and two build jobs.
    # Container.withExec [ "bash", "crates/matching/scripts/validate.sh" ]
  pure "Matching regression tests passed"

main :: Effect Unit
main = CI.runModule
  [ Module.object_ "RustChecks" {}
      [ Module.function "sdk" "Run the Rust SDK tests with stable Rust."
          (Module.argument "source") sdk
      , Module.function "tracklist" "Check workspace formatting and test tracklist with Redis."
          (Module.argument "source") tracklist
      , Module.function "matching" "Run the full matching regression suite with SQLite and mock providers."
          (Module.argument "source") matching
      ]
  ]
