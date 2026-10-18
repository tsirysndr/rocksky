-- | The Aff idioms that replace the Effect-TS pipelines of the TypeScript
-- | source: timeouts, retries, logged fallbacks and sleeps.
module Rocksky.Lib.Aff
  ( sleep
  , timeoutMs
  , isTimeoutError
  , recoverWith
  , recoverWithM
  , recoverLog
  , retryWhen
  , retryTransientDb
  , retryTimes
  , forkAndForget
  , orNothing
  , bracketKilled
  ) where

import Prelude

import Control.Monad.Error.Class (try)
import Control.Parallel (parOneOf)
import Data.Either (Either(..), either)
import Data.Int (fromNumber, toNumber)
import Data.Maybe (Maybe(..))
import Effect.Aff (Aff, Error, Milliseconds(..), attempt, delay, error, forkAff, generalBracket, message, throwError)
import Effect.Class (liftEffect)
import Effect.Random (random)
import Rocksky.Lib.DbRetry (isTransientDbError)
import Rocksky.Lib.Error (logError)

sleep :: Int -> Aff Unit
sleep ms = delay (Milliseconds (toNumber ms))

timeoutMessage :: String
timeoutMessage = "TimeoutException: operation timed out"

-- | `Effect.timeout`: the losing side is killed. Fails with a timeout error.
timeoutMs :: forall a. Int -> Aff a -> Aff a
timeoutMs ms act = do
  r <- parOneOf [ attempt act, Left (error timeoutMessage) <$ sleep ms ]
  either throwError pure r

isTimeoutError :: Error -> Boolean
isTimeoutError e = message e == timeoutMessage

-- | `Effect.catchAll(err => { consola.error(err); return Effect.succeed(x) })`.
recoverWith :: forall a. a -> Aff a -> Aff a
recoverWith fallback act = attempt act >>= either (\e -> liftEffect (logError e) $> fallback) pure

-- | Like `recoverWith`, computing the fallback from the error.
recoverWithM :: forall a. (Error -> Aff a) -> Aff a -> Aff a
recoverWithM fallback act = attempt act >>= either (\e -> liftEffect (logError e) *> fallback e) pure

-- | Run, log a failure with a prefix, and return `Nothing` on failure.
recoverLog :: forall a. String -> Aff a -> Aff (Maybe a)
recoverLog prefix act = attempt act >>= case _ of
  Right a -> pure (Just a)
  Left e -> liftEffect (logError (error (prefix <> ": " <> message e))) $> Nothing

-- | Retry up to `times` more attempts while `shouldRetry` holds, with a
-- | jittered exponential backoff starting at `baseMs`.
retryWhen :: forall a. Int -> Int -> (Error -> Boolean) -> Aff a -> Aff a
retryWhen times baseMs shouldRetry act = go 0
  where
  go n = do
    r <- try act
    case r of
      Right a -> pure a
      Left e
        | n < times && shouldRetry e -> do
            jitter <- liftEffect random
            sleep (round' (toNumber (baseMs * pow2 n) * (0.5 + jitter)))
            go (n + 1)
        | otherwise -> throwError e
  pow2 n = if n <= 0 then 1 else 2 * pow2 (n - 1)
  round' x = case fromNumber x of
    Just i | i >= 1 -> i
    _ -> 1

-- | `Effect.retry(transientDbRetry)`: at most two more attempts, exponential
-- | from 100ms, only for errors where a fresh connection can succeed.
retryTransientDb :: forall a. Aff a -> Aff a
retryTransientDb = retryWhen 2 100 isTransientDbError

-- | `Effect.retry({ times })` with no backoff and no predicate.
retryTimes :: forall a. Int -> Aff a -> Aff a
retryTimes n = retryWhen n 0 (const true)

-- | Fire and forget; failures are logged, never raised.
forkAndForget :: Aff Unit -> Aff Unit
forkAndForget act = void (forkAff (recoverWith unit act))

-- | Swallow any failure into `Nothing`, silently.
orNothing :: forall a. Aff a -> Aff (Maybe a)
orNothing act = either (const Nothing) Just <$> attempt act

-- | A bracket whose release knows whether the body was killed (timeout).
bracketKilled :: forall a b. Aff a -> (a -> Boolean -> Aff Unit) -> (a -> Aff b) -> Aff b
bracketKilled acquire release = generalBracket acquire
  { killed: \_ a -> release a true
  , failed: \_ a -> release a false
  , completed: \_ a -> release a false
  }
