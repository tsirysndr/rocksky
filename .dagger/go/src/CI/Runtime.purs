module CI.Runtime (runModule) where

import Prelude
import Dagger as Dagger
import Dagger.Modules (ObjectDefinition)
import Dagger.Module.Runtime as Runtime
import Effect (Effect)
import Effect.Aff (launchAff_)

foreign import sessionCredentials :: Effect { port :: Int, token :: String }

-- Cold image pulls and Go compilation can exceed the SDK's five-minute default.
-- Leave headroom for module setup within the workflow's 30-minute job limit.
runModule :: Array ObjectDefinition -> Effect Unit
runModule definitions = do
  credentials <- sessionCredentials
  client <- Dagger.connectWith
    { port: credentials.port, token: credentials.token, timeoutMs: 25 * 60 * 1000 }
  launchAff_ (Runtime.serve client definitions)
