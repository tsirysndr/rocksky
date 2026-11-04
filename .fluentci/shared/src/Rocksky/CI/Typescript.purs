module Rocksky.CI.Typescript where

import Prelude
import CI.Docker.Types (Client, Directory)
import CI.Runtime as CI
import CI.Docker.Container as Container
import CI.Docker.Directory as Directory
import CI.Module as Module
import CI.Docker.Query as Query
import Data.Maybe (Maybe(..))
import Effect (Effect)
import CI.Effect (Aff)

sdk :: Client -> Directory -> Aff String
sdk client source = do
  let
    package = source
    environment = Query.container client
      # Container.from "oven/bun:1.4.3"
      # Container.withMountedCache "/root/.bun/install/cache" (Query.cacheVolume "rocksky-typescript-bun" client)
      # Container.withWorkdir "/src"
      -- Install from the SDK's own lockfile, independent of the monorepo workspace.
      # Container.withFile "/src/package.json" (Directory.file "package.json" package)
      # Container.withFile "/src/bun.lock" (Directory.file "bun.lock" package)
      # Container.withExec [ "bun", "install", "--frozen-lockfile" ]
      # Container.withDirectoryWith "/src" package
          (Container.defaultWithDirectoryOpts
            { exclude = Just [ "node_modules", "dist", ".git", ".env", ".env.*" ] })
      # Container.withExec [ "bun", "test" ]
  void $ Container.sync environment
  pure "TypeScript SDK tests passed"

-- tsx invokes Node, so provide Node as well as the pinned Bun installer.
cli :: Client -> Directory -> Aff String
cli client source = do
  let
    bun = Query.container client # Container.from "oven/bun:1.4.3"
    environment = Query.container client
      # Container.from "node:24-bookworm-slim"
      # Container.withFile "/usr/local/bin/bun" (Container.file "/usr/local/bin/bun" bun)
      # Container.withMountedCache "/root/.bun/install/cache" (Query.cacheVolume "rocksky-cli-bun" client)
      # Container.withWorkdir "/src"
      # Container.withDirectoryWith "/src" source
          (Container.defaultWithDirectoryOpts
            { exclude = Just [ "node_modules", "dist", ".git", ".env", ".env.*" ] })
      -- Preserve the existing non-frozen install; the CLI lockfile is historical.
      # Container.withExec [ "bun", "install" ]
      # Container.withExec [ "bun", "run", "test" ]
  void $ Container.sync environment
  pure "CLI smoke tests passed"

apiContracts :: Client -> Directory -> Aff String
apiContracts client source = do
  let
    bun = Query.container client # Container.from "oven/bun:1.4.3"
    postgres = Query.container client
      # Container.from "postgres:16-alpine"
      # Container.withEnvVariable "POSTGRES_USER" "postgres"
      # Container.withEnvVariable "POSTGRES_PASSWORD" "postgres"
      # Container.withEnvVariable "POSTGRES_DB" "api_test"
      # Container.withExposedPort 5432
      # Container.asService
    environment = Query.container client
      # Container.from "node:24-bookworm-slim"
      # Container.withFile "/usr/local/bin/bun" (Container.file "/usr/local/bin/bun" bun)
      # Container.withMountedCache "/root/.bun/install/cache" (Query.cacheVolume "rocksky-api-bun" client)
      # Container.withWorkdir "/src"
      -- Keep the complete workspace, patches, and shared contract fixtures.
      # Container.withDirectoryWith "/src" source
          (Container.defaultWithDirectoryOpts
            { exclude = Just [ ".git", ".dagger", "**/node_modules", "**/target", "**/.env", "**/.env.*" ] })
      # Container.withExec [ "bun", "install", "--frozen-lockfile", "--ignore-scripts" ]
      # Container.withWorkdir "/src/apps/api"
      # Container.withExec [ "bun", "run", "audit:xrpc" ]
      # Container.withServiceBinding "postgres" postgres
      # Container.withEnvVariable "ROCKSKY_QUERY_TEST_DATABASE_URL" "postgres://postgres:postgres@postgres:5432/api_test"
      # Container.withExec
          [ "bun", "test", "src/lib/rsql.test.ts", "src/lib/catalogFilters.test.ts", "src/lib/queryCache.test.ts" ]
      # Container.withoutEnvVariable "ROCKSKY_QUERY_TEST_DATABASE_URL"
      # Container.withExec
          [ "bun", "test", "src/xrpc/app/rocksky/song/matchingService.test.ts", "src/xrpc/app/rocksky/song/matchSongUris.test.ts" ]
      # Container.withExec
          [ "bun", "test", "src/tealfm/publication.test.ts", "src/lib/durableSubmission.test.ts"
          , "src/lib/durableRecord.test.ts", "src/lib/recordOwnership.test.ts", "src/lib/recordPosition.test.ts"
          ]
  void $ Container.sync environment
  pure "API contract, query, matching, and durable record tests passed"

definitions :: Array Module.ObjectDefinition
definitions =
  [ Module.object_ "TypescriptChecks" {}
      [ Module.function "sdk" "Install locked dependencies and run TypeScript SDK tests."
          (Module.argument "source") sdk
      , Module.function "cli" "Install CLI dependencies and run its import parser smoke tests."
          (Module.argument "source") cli
      , Module.function "apiContracts" "Audit API contracts and run API regression tests with PostgreSQL."
          (Module.argument "source") apiContracts
      ]
  ]

run :: String -> Effect Unit
run = CI.runModule definitions

sdkJob :: Effect Unit
sdkJob = run "sdk"

cliJob :: Effect Unit
cliJob = run "cli"

apiContractsJob :: Effect Unit
apiContractsJob = run "apiContracts"
