module Rocksky.Lib.PgConnectionRecovery
  ( handlePgConnectionErrors
  , isPgConnectionError
  , retryPgConnection
  ) where

import Prelude

import Data.Array (elem)
import Data.Either (Either(..), hush)
import Data.Int (pow)
import Data.Maybe (Maybe(..), fromMaybe)
import Data.String.Regex (regex, test)
import Data.String.Regex.Flags (ignoreCase)
import Effect (Effect)
import Effect.Aff (Aff, Error, attempt, message, throwError)
import Effect.Class (liftEffect)
import Pg (Pool)
import Pg as Pg
import Rocksky.Lib.Aff (sleep)
import Rocksky.Lib.Error (errorCode)
import Rocksky.Lib.Foreign (unsafeFromForeign)

-- | Pool error handlers cover idle clients; checked-out transaction clients
-- | need their own.
handlePgConnectionErrors :: Pool -> String -> (String -> Effect Unit) -> Effect Unit
handlePgConnectionErrors pool label report = do
  Pg.onPoolError pool \e -> report ("Idle pg client error on " <> label <> ": " <> message (unsafeFromForeign e))
  Pg.onPoolConnect pool \client ->
    -- pg marks the connection unusable and rejects active/future queries. Let
    -- its pool discard it; do not release a client's in-flight transaction.
    Pg.onClientError client \e -> report ("Pg connection error on " <> label <> ": " <> message (unsafeFromForeign e))

connectionCodes :: Array String
connectionCodes =
  [ "ECONNRESET", "ECONNREFUSED", "EPIPE", "ETIMEDOUT", "ENETUNREACH", "EHOSTUNREACH", "EAI_AGAIN"
  , "57P01", "57P02", "57P03", "08000", "08001", "08003", "08004", "08006", "08007"
  ]

isPgConnectionError :: Error -> Boolean
isPgConnectionError e =
  (fromMaybe false (map (_ `elem` connectionCodes) (errorCode e))) || messageMatches
  where
  messageMatches = case hush (regex "^(?:connection (?:terminated|closed)(?: unexpectedly| due to connection timeout)?|client (?:has encountered a connection error|was closed).*|timeout exceeded when trying to connect)$" ignoreCase) of
    Just re -> test re (message e)
    Nothing -> false

-- | Only use for reads or a whole idempotent operation, never arbitrary writes.
retryPgConnection :: forall a. { attempts :: Int, onRetry :: Int -> Int -> Effect Unit } -> Aff a -> Aff a
retryPgConnection opts run = go 1
  where
  go n = do
    r <- attempt run
    case r of
      Right a -> pure a
      Left e
        | n >= opts.attempts || not (isPgConnectionError e) -> throwError e
        | otherwise -> do
            let delayMs = min (1000 * pow 2 (n - 1)) 30000
            liftEffect (opts.onRetry n delayMs)
            sleep delayMs
            go (n + 1)
