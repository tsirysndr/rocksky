module Fetch.Abort (withTimeout) where

import Prelude
import Effect (Effect)
import Effect.Aff (Aff, bracket)
import Effect.Class (liftEffect)
import Fetch (AbortSignal)

foreign import data TimedController :: Type
foreign import start :: Int -> Effect TimedController
foreign import signal :: TimedController -> AbortSignal
foreign import clear :: TimedController -> Effect Unit

-- Clear the timer after the entire operation, including body consumption.
withTimeout :: forall a. Int -> (AbortSignal -> Aff a) -> Aff a
withTimeout ms action = bracket (liftEffect (start ms)) (liftEffect <<< clear) (action <<< signal)
