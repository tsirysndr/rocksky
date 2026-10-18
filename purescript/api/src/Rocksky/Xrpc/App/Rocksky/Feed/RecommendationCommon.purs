module Rocksky.Xrpc.App.Rocksky.Feed.RecommendationCommon where

import Prelude
import Consola as Log
import Data.Array as A
import Data.Number as Number
import Data.String as S
import Data.Either (Either(..))
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Nullable (Nullable, notNull, toMaybe)
import Effect (Effect)
import Effect.Aff (Aff, attempt, error, throwError)
import Effect.Class (liftEffect)
import Fetch as Fetch
import Fetch.URL as URL
import Foreign (Foreign)
import Node.Process (lookupEnv)
import Rocksky.Lib.Aff (retryTransientDb, timeoutMs)
import Rocksky.Lib.Foreign as F
import Rocksky.Lib.ResultCache as Cache
import Rocksky.Scripts.Common (showNumber)

type QueryParams = { did :: String, limit :: Nullable Number }
normalized :: QueryParams -> QueryParams
normalized p = p { limit = notNull (fromMaybe 50.0 (toMaybe p.limit)) }
cacheKey :: QueryParams -> String
cacheKey p = p.did <> "|" <> showNumber (fromMaybe 50.0 (toMaybe p.limit))

fromDrift :: String -> String -> QueryParams -> Aff Foreign
fromDrift base route params = do
  url <- liftEffect do
    url <- URL.resolve route base
    URL.setParam url "did" params.did
    URL.setParam url "limit" (showNumber (min (fromMaybe 50.0 (toMaybe params.limit)) 100.0))
    URL.serialize url
  signal <- liftEffect (Fetch.timeoutSignal 3000)
  response <- Fetch.fetchWith url (Fetch.defaultOptions { signal = notNull signal })
  unless (Fetch.ok response) (throwError (error ("drift responded " <> show (Fetch.status response))))
  Fetch.json response

lookupWith :: Maybe String -> String -> (QueryParams -> Aff Foreign) -> QueryParams -> Aff Foreign
lookupWith drift route legacy params = case drift of
  Just base | base /= "" -> do
    result <- attempt (fromDrift base route params)
    case result of
      Right value -> pure value
      Left e -> do
        liftEffect (Log.warnF "drift unavailable, using legacy pipeline:" [F.toForeign e])
        fallback
  _ -> fallback
  where
  fallback = timeoutMs 30000 (retryTransientDb (legacy params))

cached :: String -> String -> Foreign -> (QueryParams -> Aff Foreign) -> Effect (QueryParams -> Aff Foreign)
cached label route empty legacy = do
  drift <- lookupEnv "DRIFT_URL"
  -- The source serializes the key then reconstructs params. Keep limits
  -- uncapped in cache keys; the lookup performs the cap independently.
  lookup <- Cache.create 300000 200 (\key -> lookupWith drift route legacy (decodeKey key))
  pure \params -> do
    result <- attempt (lookup (cacheKey params))
    case result of
      Right value -> pure value
      Left e -> liftEffect (Log.errorF (label <> " error:") [F.toForeign e]) *> pure empty

-- DID/handle input may contain a pipe: split at its final occurrence.
decodeKey :: String -> QueryParams
decodeKey key =
  let pieces = S.split (S.Pattern "|") key
      limit = fromMaybe 50.0 (A.last pieces >>= Number.fromString)
  in { did: S.joinWith "|" (A.dropEnd 1 pieces), limit: notNull limit }
