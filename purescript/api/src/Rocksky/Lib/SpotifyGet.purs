-- | One authenticated GET against the Spotify proxy, with a real request
-- | timeout and status-aware retries (`src/lib/spotifyGet.ts`).
module Rocksky.Lib.SpotifyGet
  ( spotifyGet
  , spotifyTimeoutMs
  , maxSpotifyRetries
  , spotifyRequestError
  , isSpotifyRequestError
  , spotifyErrorStatus
  , isRateLimited
  ) where

import Prelude

import Consola as Consola
import Data.Either (Either(..))
import Data.Int (ceil, pow, toNumber)
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Nullable (Nullable, notNull, null, toMaybe, toNullable)
import Data.Number (isFinite)
import Data.Number.Format (toString)
import Effect.Aff (Aff, Error, message, throwError)
import Effect.Aff as Aff
import Effect.Class (liftEffect)
import Fetch (AbortSignal)
import Fetch as Fetch
import Foreign (Foreign)
import Foreign.Object as Object
import Rocksky.Lib.EnrichmentBudget (anySignal, isAbortError, isAborted, sleepAbortable, throwIfAborted)

maxSpotifyRetries :: Int
maxSpotifyRetries = 3

initialRetryDelayMs :: Int
initialRetryDelayMs = 1000

-- | The whole matchSong pipeline runs under a 10 second timeout, so a single
-- | Spotify call has to give up well before that — otherwise the timeout
-- | never fires here and the pipeline is torn down with requests still in flight.
spotifyTimeoutMs :: Int
spotifyTimeoutMs = 5000

-- | Longest Retry-After we are willing to wait out inline. Anything longer means
-- | the app is properly rate limited: give up on Spotify and let Deezer answer.
maxRetryAfterMs :: Number
maxRetryAfterMs = 3000.0

-- | `new SpotifyRequestError(status, operation, message?)`.
foreign import spotifyRequestError :: Int -> String -> Nullable String -> Error
foreign import isSpotifyRequestError :: Error -> Boolean
foreign import spotifyErrorStatusImpl :: Error -> Nullable Int
foreign import jsNumber :: String -> Number

spotifyErrorStatus :: Error -> Maybe Int
spotifyErrorStatus = toMaybe <<< spotifyErrorStatusImpl

isRateLimited :: Error -> Boolean
isRateLimited e = spotifyErrorStatus e == Just 429

signalAborted :: Maybe AbortSignal -> Aff Boolean
signalAborted = case _ of
  Nothing -> pure false
  Just s -> liftEffect (isAborted s)

-- | The timeout is handed to fetch as a signal rather than raced against the
-- | promise: abandoning a promise leaves the socket open, so the request keeps
-- | occupying a slot in the proxy's rate limiter until Node's 300s socket
-- | timeout fires. That is what turned every retry into a wasted queue slot and
-- | filled the proxy's log with 502s.
spotifyGet :: String -> String -> String -> Maybe AbortSignal -> Aff Foreign
spotifyGet url accessToken operation signal = go 0 Nothing
  where
  attemptsLabel attempt = "attempt=" <> show (attempt + 1) <> "/" <> show maxSpotifyRetries

  go :: Int -> Maybe Error -> Aff Foreign
  go attempt lastError
    | attempt >= maxSpotifyRetries =
        throwError (fromMaybe (spotifyRequestError 0 operation (notNull ("Spotify " <> operation <> " exhausted its retries"))) lastError)
    | otherwise = do
        let
          backoffMs = initialRetryDelayMs * pow 2 attempt
          isLastAttempt = attempt == maxSpotifyRetries - 1
        case signal of
          Just s -> throwIfAborted s
          Nothing -> pure unit
        timeout <- liftEffect (Fetch.timeoutSignal spotifyTimeoutMs)
        requestSignal <- liftEffect case signal of
          Just s -> anySignal [ s, timeout ]
          Nothing -> pure timeout
        result <- Aff.attempt $ Fetch.fetchWith url
          Fetch.defaultOptions
            { headers = Object.singleton "Authorization" ("Bearer " <> accessToken)
            , signal = notNull requestSignal
            }
        case result of
          Left err -> do
            -- Repeating a timed-out catalog search compounds overload. Let the
            -- caller use its alternate metadata provider instead.
            aborted <- signalAborted signal
            if isAbortError err || aborted then throwError err
            else if isLastAttempt then throwError err
            else do
              liftEffect $ Consola.warn
                ("Spotify " <> operation <> " network error, retrying " <> attemptsLabel attempt <> " delay_ms=" <> show backoffMs)
              sleepAbortable backoffMs signal
              go (attempt + 1) (Just err)
          Right response
            | Fetch.ok response -> do
                body <- Aff.attempt (Fetch.json response)
                case body of
                  Right b -> pure b
                  Left e -> throwError $ spotifyRequestError (Fetch.status response) operation
                    (notNull ("Spotify " <> operation <> " returned a malformed body: " <> message e))
            -- 429 from Spotify itself or from the proxy's own queue: both send a
            -- Retry-After telling us exactly how long to hold off.
            | Fetch.status response == 429 -> do
                let
                  retryAfter = jsNumber (fromMaybe "" (Fetch.header response "retry-after"))
                  waitMs = if isFinite retryAfter && retryAfter > 0.0 then retryAfter * 1000.0 else toNumber backoffMs
                if isLastAttempt || waitMs > maxRetryAfterMs then
                  throwError $ spotifyRequestError 429 operation
                    (notNull ("Spotify " <> operation <> " rate limited (retry-after: " <> (if retryAfter > 0.0 then toString retryAfter else "unset") <> "s)"))
                else do
                  liftEffect $ Consola.warn
                    ("Spotify " <> operation <> " rate limited, waiting " <> toString waitMs <> "ms (" <> attemptsLabel attempt <> ")")
                  sleepAbortable (ceil waitMs) signal
                  go (attempt + 1) lastError
            | Fetch.status response >= 500 -> do
                let err = spotifyRequestError (Fetch.status response) operation null
                if isLastAttempt then throwError err
                else do
                  liftEffect $ Consola.warn
                    ("Spotify " <> operation <> " returned " <> show (Fetch.status response) <> ", retrying " <> attemptsLabel attempt <> " delay_ms=" <> show backoffMs)
                  sleepAbortable backoffMs signal
                  go (attempt + 1) (Just err)
            -- 400/401/403/404 — retrying with the same token and query cannot help.
            | otherwise -> throwError (spotifyRequestError (Fetch.status response) operation null)

  _unused :: Nullable Int -> Nullable Int
  _unused = toNullable <<< toMaybe
