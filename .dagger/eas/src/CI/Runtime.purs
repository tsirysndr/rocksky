module CI.Runtime (runModule) where

import Prelude
import Dagger as Dagger
import Dagger.Modules (ObjectDefinition)
import Dagger.Module.Runtime as Runtime
import Effect (Effect)
import Effect.Aff (launchAff_)

foreign import sessionCredentials :: Effect { port :: Int, token :: String }

-- Local Android builds (including native hooks) can exceed 25 minutes.
runModule :: Array ObjectDefinition -> Effect Unit
runModule definitions = do
  credentials <- sessionCredentials
  client <- Dagger.connectWith
    { port: credentials.port, token: credentials.token, timeoutMs: 2 * 60 * 60 * 1000 }
  launchAff_ (Runtime.serve client definitions)
