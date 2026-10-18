-- | Bindings for `@pyroscope/nodejs`.
module Pyroscope (init, start) where

import Prelude
import Effect (Effect)

-- | `Pyroscope.init({ serverAddress, appName })`.
foreign import init :: { serverAddress :: String, appName :: String } -> Effect Unit

foreign import start :: Effect Unit
