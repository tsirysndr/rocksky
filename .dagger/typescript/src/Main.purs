module Main where

import Prelude
import CI.Runtime as CI
import Dagger (Client)
import Dagger.Container as Container
import Dagger.Directory as Directory
import Dagger.Modules as Module
import Dagger.Query as Query
import Dagger.Types (Directory)
import Data.Maybe (Maybe(..))
import Effect (Effect)
import Effect.Aff (Aff)

sdk :: Client -> Directory -> Aff String
sdk client source = do
  let
    package = source
    environment = Query.container client
      # Container.from "oven/bun:1.4.2"
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
    bun = Query.container client # Container.from "oven/bun:1.4.2"
    environment = Query.container client
      # Container.from "node:22-bookworm-slim"
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

main :: Effect Unit
main = CI.runModule
  [ Module.object_ "TypescriptChecks" {}
      [ Module.function "sdk" "Install locked dependencies and run TypeScript SDK tests."
          (Module.argument "source") sdk
      , Module.function "cli" "Install CLI dependencies and run its import parser smoke tests."
          (Module.argument "source") cli
      ]
  ]
