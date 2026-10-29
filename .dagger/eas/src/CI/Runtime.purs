module CI.Runtime (runModule) where

import Prelude
import Dagger as Dagger
import Dagger.Modules (ObjectDefinition)
import Dagger.Module.Runtime as Runtime
import Effect (Effect)
import Effect.Aff (launchAff_)

foreign import sessionCredentials :: Effect { port :: Int, token :: String }

-- A request can execute a full native build. Let the workflow bound its lifetime.
runModule :: Array ObjectDefinition -> Effect Unit
runModule definitions = do
  credentials <- sessionCredentials
  client <- Dagger.connectWith
    { port: credentials.port, token: credentials.token, timeoutMs: 0 }
  launchAff_ (Runtime.serve client definitions)
