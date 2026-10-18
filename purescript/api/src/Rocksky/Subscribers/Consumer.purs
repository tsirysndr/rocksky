module Rocksky.Subscribers.Consumer (start, startRaw) where

import Prelude
import Consola as Log
import Data.Either (Either(..))
import Data.Maybe (Maybe(..))
import Effect (Effect)
import Effect.Aff (Aff, attempt, error, launchAff_, throwError)
import Effect.Class (liftEffect)
import Foreign (Foreign)
import Nats as Nats
import Rocksky.Context (Context)
import Rocksky.Lib.Foreign (parseJson, toForeign)

-- Pulling the next message only after processing preserves the source's
-- for-await loop ordering, including when indexing is slow.
start :: Context -> String -> (Foreign -> Aff Unit) -> Effect Nats.Subscription
start ctx subject handler = startRaw ctx subject \raw -> do
  payload <- case parseJson raw of
    Left e -> throwError (error e)
    Right value -> pure value
  handler payload

startRaw :: Context -> String -> (String -> Aff Unit) -> Effect Nats.Subscription
startRaw ctx subject handler = do
  subscription <- Nats.subscribePull ctx.nc subject
  launchAff_ do
    result <- attempt (loop subscription)
    case result of
      Left e -> liftEffect (Log.errorF (subject <> " subscriber crashed:") [toForeign e])
      Right _ -> pure unit
  pure subscription
  where
  loop subscription = Nats.nextMessage subscription >>= case _ of
    Nothing -> pure unit
    Just message -> do
      result <- attempt (handler (Nats.decodeString message))
      case result of
        Left e -> liftEffect (Log.errorF (subject <> " handler error:") [toForeign e])
        Right _ -> pure unit
      loop subscription
