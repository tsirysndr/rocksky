module Rocksky.CI.Elixir where

import Prelude
import CI.Docker.Types (Client, Directory)
import CI.Runtime as CI
import CI.Docker.Container as Container
import CI.Module as Module
import CI.Docker.Query as Query
import Data.Maybe (Maybe(..))
import Effect (Effect)
import CI.Effect (Aff)

remoteWs :: Client -> Directory -> Aff String
remoteWs client source = do
  void $ Container.sync $ Query.container client
    # Container.from "elixir:1.18.4-otp-27"
    # Container.withWorkdir "/src"
    # Container.withExec [ "mix", "local.hex", "--force" ]
    # Container.withExec [ "mix", "local.rebar", "--force" ]
    # Container.withMountedCache "/root/.hex" (Query.cacheVolume "rocksky-elixir-hex" client)
    # Container.withMountedCache "/src/deps" (Query.cacheVolume "rocksky-remote-ws-deps" client)
    # Container.withMountedCache "/src/_build" (Query.cacheVolume "rocksky-remote-ws-build-1.18-27" client)
    # Container.withDirectoryWith "/src" source
        (Container.defaultWithDirectoryOpts
          { exclude = Just [ "deps", "_build", ".git", ".env", ".env.*" ] })
    # Container.withExec [ "mix", "deps.get" ]
    -- mix test selects config/test.exs, which disables external services.
    # Container.withExec [ "mix", "test" ]
  pure "Remote WebSocket relay tests passed"

definitions :: Array Module.ObjectDefinition
definitions =
  [ Module.object_ "ElixirChecks" {}
      [ Module.function "remoteWs" "Run relay tests with Elixir 1.18 and OTP 27."
          (Module.argument "source") remoteWs
      ]
  ]

run :: String -> Effect Unit
run = CI.runModule definitions

remoteWsJob :: Effect Unit
remoteWsJob = run "remoteWs"
