module Rocksky.Feeds.Telemetry where

import Prelude
import Control.Promise (Promise, fromAff, toAffE)
import Effect (Effect)
import Effect.Aff (Aff)
import Foreign (Foreign)
import Hono (App)
import Pg (Pool)

foreign import installHttp :: App -> Effect Unit
foreign import instrumentPool :: Pool -> Effect Pool
foreign import count :: String -> String -> Effect Unit
foreign import measureImpl :: String -> String -> Int -> Boolean -> Boolean -> Effect (Promise Foreign) -> Effect (Promise Foreign)

measure :: String -> String -> Int -> Boolean -> Boolean -> Aff Foreign -> Aff Foreign
measure algo publisher limit paginated authenticated action =
  toAffE $ measureImpl algo publisher limit paginated authenticated (fromAff action)
