module Main where

import Prelude
import CI.Runtime as CI
import Dagger (Client)
import Dagger.Container as Container
import Dagger.Modules as Module
import Dagger.Query as Query
import Dagger.Types (Container, Directory, File, Platform(..))
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

submissions :: Client -> Directory -> Aff String
submissions client source = do
  let
    bun = Query.container client # Container.from "oven/bun:1.4.2"
    node = Query.container client # Container.from "node:22-bookworm-slim"
    databaseUrl = "postgres://postgres:postgres@postgres:5432/submissions_test"
    postgres = Query.container client
      # Container.from "postgres:16-alpine"
      # Container.withEnvVariable "POSTGRES_USER" "postgres"
      # Container.withEnvVariable "POSTGRES_PASSWORD" "postgres"
      # Container.withEnvVariable "POSTGRES_DB" "submissions_test"
      # Container.withExposedPort 5432
      # Container.asService
    environment = rust client "submissions"
      # Container.withExec [ "sh", "-c", "apt-get update && apt-get install -y --no-install-recommends python3 postgresql-client git && rm -rf /var/lib/apt/lists/*" ]
      # Container.withFile "/usr/local/bin/bun" (Container.file "/usr/local/bin/bun" bun)
      # Container.withFile "/usr/local/bin/node" (Container.file "/usr/local/bin/node" node)
      # Container.withMountedCache "/root/.bun/install/cache" (Query.cacheVolume "rocksky-submissions-bun" client)
      # Container.withDirectoryWith "/src" source
          (Container.defaultWithDirectoryOpts
            { include = Just [ "Cargo.toml", "Cargo.lock", "crates/**" ]
            , exclude = Just [ "**/target", "**/node_modules", "**/.git", "**/.env", "**/.env.*" ]
            })
      # Container.withWorkdir "/src/crates/submissions/dashboard"
      -- check:dist compares the rebuilt assets to this input snapshot. No host Git metadata is needed.
      # Container.withExec [ "git", "init", "--quiet" ]
      # Container.withExec [ "git", "add", "--force", "dist" ]
      # Container.withExec [ "bun", "install", "--frozen-lockfile" ]
      # Container.withExec [ "bun", "run", "test" ]
      # Container.withExec [ "bun", "run", "check:dist" ]
      # Container.withWorkdir "/src"
      # Container.withServiceBinding "postgres" postgres
      # Container.withEnvVariable "SUBMISSIONS_TEST_POSTGRES_URL" databaseUrl
      # Container.withExec [ "cargo", "test", "--locked", "-p", "rocksky-submissions", "--", "--include-ignored" ]
      # Container.withoutEnvVariable "SUBMISSIONS_TEST_POSTGRES_URL"
      # Container.withEnvVariable "ROCKSKY_TEST_POSTGRES_URL" databaseUrl
      # Container.withExec [ "cargo", "test", "--locked", "-p", "rocksky-jetstream", "--all-features", "--lib" ]
      # Container.withoutEnvVariable "ROCKSKY_TEST_POSTGRES_URL"
      # Container.withExec [ "cargo", "test", "--locked", "-p", "rocksky-submissions", "--no-default-features", "--features", "sqlite" ]
      # Container.withEnvVariable "SUBMISSIONS_TEST_POSTGRES_URL" databaseUrl
      # Container.withExec [ "cargo", "test", "--locked", "-p", "rocksky-submissions", "--all-features", "--", "--include-ignored" ]
      # Container.withoutEnvVariable "SUBMISSIONS_TEST_POSTGRES_URL"
      # Container.withExec [ "cargo", "build", "--locked", "-p", "rocksky-submissions" ]
      # Container.withEnvVariable "SUBMISSIONS_TEST_POSTGRES_URL" databaseUrl
      # Container.withExec [ "python3", "crates/submissions/tests/http_smoke.py", "target/debug/rocksky-submissions" ]
  void $ Container.sync environment
  pure "Submissions dashboard, backend, ingestion, and crash-recovery checks passed"

riff :: Client -> Directory -> Aff String
riff client source = do
  void $ Container.sync $ rust client "riff"
    # Container.withExec [ "sh", "-c", "apt-get update && apt-get install -y --no-install-recommends python3 curl jq ca-certificates && rm -rf /var/lib/apt/lists/*" ]
    # Container.withExec [ "rustup", "component", "add", "rustfmt", "clippy" ]
    # Container.withDirectoryWith "/src" source
        (Container.defaultWithDirectoryOpts
          { exclude = Just [ "target", ".git", ".env", ".env.*" ] })
    # Container.withExec [ "cargo", "fmt", "--all", "--", "--check" ]
    -- cargo.sh verifies the static DuckDB download and keeps it in the target cache.
    # Container.withExec [ "./cargo.sh", "clippy", "--release", "--all-targets", "--", "-D", "warnings" ]
    # Container.withExec [ "./cargo.sh", "test", "--release", "--all-targets" ]
    # Container.withExec [ "bash", "scripts/ci-smoke.sh" ]
  pure "Riff formatting, Clippy, tests, and HTTP smoke checks passed"

-- The deployment host and the existing DuckDB archive both target Linux amd64.
rockskyd :: Client -> Directory -> Aff File
rockskyd client source = do
  let
    environment = Query.containerWith
      (Query.defaultContainerOpts { platform = Just (Platform "linux/amd64") }) client
      # Container.from "rust:bookworm"
      # Container.withMountedCache "/usr/local/cargo/registry" (Query.cacheVolume "rocksky-cargo-registry" client)
      # Container.withMountedCache "/usr/local/cargo/git" (Query.cacheVolume "rocksky-cargo-git" client)
      # Container.withMountedCache "/src/target" (Query.cacheVolume "rocksky-rockskyd-release-amd64" client)
      # Container.withWorkdir "/src"
      # Container.withExec [ "sh", "-c", "apt-get update && apt-get install -y --no-install-recommends libreadline-dev pkg-config flex bison build-essential unzip curl ca-certificates && rm -rf /var/lib/apt/lists/*" ]
      # Container.withExec [ "curl", "--fail", "--location", "--retry", "3", "--output", "/tmp/duckdb.zip", "https://github.com/duckdb/duckdb/releases/download/v1.4.0/libduckdb-linux-amd64.zip" ]
      # Container.withExec [ "unzip", "-o", "/tmp/duckdb.zip", "-d", "/tmp/duckdb" ]
      # Container.withExec [ "cp", "/tmp/duckdb/libduckdb.so", "/usr/local/lib/" ]
      # Container.withExec [ "cp", "/tmp/duckdb/duckdb.h", "/tmp/duckdb/duckdb.hpp", "/usr/local/include/" ]
      # Container.withExec [ "ldconfig" ]
      # Container.withEnvVariable "DUCKDB_LIB_DIR" "/usr/local/lib"
      # Container.withEnvVariable "DUCKDB_INCLUDE_DIR" "/usr/local/include"
      # Container.withDirectoryWith "/src" source
          (Container.defaultWithDirectoryOpts
            { include = Just [ "Cargo.toml", "Cargo.lock", "crates/**", "apps/web/dist/**" ]
            , exclude = Just [ "**/target", "**/node_modules", "**/.git", "**/.env", "**/.env.*" ]
            })
      # Container.withExec [ "cargo", "build", "-p", "rockskyd", "--release" ]
      -- Export a regular layer file rather than an artifact inside the target cache.
      # Container.withExec [ "install", "-D", "-m", "755", "/src/target/release/rockskyd", "/out/rockskyd" ]
  pure $ Container.file "/out/rockskyd" environment

main :: Effect Unit
main = CI.runModule
  [ Module.object_ "RustChecks" {}
      [ Module.function "sdk" "Run the Rust SDK tests with stable Rust."
          (Module.argument "source") sdk
      , Module.function "tracklist" "Check workspace formatting and test tracklist with Redis."
          (Module.argument "source") tracklist
      , Module.function "matching" "Run the full matching regression suite with SQLite and mock providers."
          (Module.argument "source") matching
      , Module.function "submissions" "Check the dashboard and worker backends, ingestion, and crash recovery with PostgreSQL."
          (Module.argument "source") submissions
      , Module.function "riff" "Check Riff formatting, Clippy, tests, and its real HTTP binary with static DuckDB."
          (Module.argument "source") riff
      , Module.function "rockskyd" "Build and return the Linux amd64 release binary for deployment."
          (Module.argument "source") rockskyd
      ]
  ]
