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

main :: Effect Unit
main = CI.runModule
  [ Module.object_ "TypescriptChecks" {}
      [ Module.function "sdk" "Install locked dependencies and run TypeScript SDK tests."
          (Module.argument "source") sdk
      ]
  ]
