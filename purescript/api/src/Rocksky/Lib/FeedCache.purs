module Rocksky.Lib.FeedCache (getFeedVersion, getScrobblesVersion, bumpScrobblesVersion, bumpAllFeedVersions) where

import Prelude

import Consola as Consola
import Control.Parallel (parTraverse_)
import Data.Array (null)
import Data.Either (Either(..))
import Data.Int (fromString)
import Data.Maybe (Maybe(..), fromMaybe)
import Drizzle.Builder (run, selectFieldsFrom)
import Drizzle.Schema (toSQL)
import Effect.Aff (Aff, attempt, message)
import Effect.Class (liftEffect)
import Redis as Redis
import Rocksky.Context (Context)
import Rocksky.Schema as T

versionKey :: String -> String
versionKey feedUri = "feed:ver:" <> feedUri

scrobblesVersionKey :: String
scrobblesVersionKey = "scrobbles:ver"

readVersion :: Context -> String -> Aff Int
readVersion ctx k = do
  r <- attempt (Redis.get ctx.redis k)
  pure case r of
    Right (Just v) -> fromMaybe 0 (fromString v)
    _ -> 0

getFeedVersion :: Context -> String -> Aff Int
getFeedVersion ctx feedUri = readVersion ctx (versionKey feedUri)

getScrobblesVersion :: Context -> Aff Int
getScrobblesVersion ctx = readVersion ctx scrobblesVersionKey

bumpScrobblesVersion :: Context -> Aff Unit
bumpScrobblesVersion ctx = do
  r <- attempt (Redis.incr ctx.redis scrobblesVersionKey)
  case r of
    Left e -> liftEffect (Consola.warn ("bumpScrobblesVersion failed: " <> message e))
    Right _ -> pure unit

bumpAllFeedVersions :: Context -> Aff Unit
bumpAllFeedVersions ctx = do
  r <- attempt do
    feeds :: Array { uri :: String } <- run ctx.db (selectFieldsFrom { uri: toSQL T.feedsC.uri } T.feeds)
    unless (null feeds) $ parTraverse_ (\f -> Redis.incr ctx.redis (versionKey f.uri)) feeds
  case r of
    Left e -> liftEffect (Consola.warn ("bumpAllFeedVersions failed: " <> message e))
    Right _ -> pure unit
