module Rocksky.Typesense.Retry (withTypesenseRetry, isTransient) where

import Prelude

import Data.Array (elem)
import Data.Either (Either(..))
import Data.Int (toNumber)
import Data.Maybe (fromMaybe)
import Effect.Aff (Aff, Error, Milliseconds(..), attempt, delay, throwError)
import Effect.Class (liftEffect)
import Effect.Random (randomInt)
import Foreign (Foreign)
import Rocksky.Lib.Error (errorToForeign)
import Rocksky.Lib.Foreign (path, readIntAt, readStringAt)

isTransient :: Error -> Boolean
isTransient = go <<< errorToForeign
  where
  go :: Foreign -> Boolean
  go e =
    fromMaybe false (map (flip elem codes) (readStringAt "code" e))
      || fromMaybe false (map (_ >= 500) (readIntAt "httpStatus" e))
      || fromMaybe false (map go (path "cause" e))
  codes = [ "ETIMEDOUT", "ECONNREFUSED", "ECONNRESET", "EAI_AGAIN", "ENOTFOUND", "EPIPE", "ENETUNREACH", "EHOSTUNREACH" ]

-- | Three attempts with exponential backoff and 0–99ms jitter.
withTypesenseRetry :: forall a. Aff a -> Aff a
withTypesenseRetry action = go 0 200
  where
  go attemptNumber baseDelay = do
    result <- attempt action
    case result of
      Right value -> pure value
      Left err
        | attemptNumber >= 2 || not (isTransient err) -> throwError err
        | otherwise -> do
            jitter <- liftEffect (randomInt 0 99)
            delay (Milliseconds (toNumber (baseDelay + jitter)))
            go (attemptNumber + 1) (baseDelay * 2)
