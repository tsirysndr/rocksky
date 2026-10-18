-- | Profile stat counts cached in Redis (`src/lib/statsCache.ts`). The counts
-- | are aggregates over the whole `scrobbles` table, and the charts pages render
-- | a hundred of them at once; five minutes collapses that into one round.
module Rocksky.Lib.StatsCache (CachedStats, readStats, writeStats, invalidateStats) where

import Prelude

import Consola as Consola
import Data.Array (catMaybes, null)
import Data.Either (Either(..))
import Data.Maybe (Maybe(..))
import Effect.Aff (Aff, attempt, message)
import Effect.Class (liftEffect)
import Redis as Redis
import Rocksky.Context (Context)
import Rocksky.Lib.Foreign (parseJson, stringify, toForeign, unsafeFromForeign)

type CachedStats = { scrobbles :: Int, artists :: Int, loved_tracks :: Int, albums :: Int, tracks :: Int }

ttlSeconds :: Int
ttlSeconds = 300

key :: String -> String
key actor = "stats:v1:" <> actor

-- | Looks up cached stats by DID or handle, whichever the caller was given.
readStats :: Context -> String -> Aff (Maybe CachedStats)
readStats ctx actor = do
  r <- attempt (Redis.get ctx.redis (key actor))
  case r of
    Right (Just raw) -> pure case parseJson raw of
      Right v -> Just (unsafeFromForeign v)
      Left _ -> Nothing
    Right Nothing -> pure Nothing
    Left e -> liftEffect (Consola.warn ("readStats failed: " <> message e)) $> Nothing

writeStats :: Context -> String -> CachedStats -> Aff Unit
writeStats ctx actor stats
  -- Never cache an empty profile: both web clients read zero scrobbles on your
  -- own profile as "new user" and show onboarding.
  | stats.scrobbles == 0 = pure unit
  | otherwise = do
      r <- attempt (Redis.setEx ctx.redis (key actor) ttlSeconds (stringify (toForeign stats)))
      case r of
        Left e -> liftEffect (Consola.warn ("writeStats failed: " <> message e))
        Right _ -> pure unit

-- | Drops every cached entry for one user. Both identifiers have to be
-- | passed: getStats is reached by DID from the apps and by handle from
-- | profile links, and each spelling caches under its own key.
invalidateStats :: Context -> Array (Maybe String) -> Aff Unit
invalidateStats ctx actors = do
  let keys = map key (catMaybes actors)
  unless (null keys) do
    r <- attempt (Redis.delMany ctx.redis keys)
    case r of
      Left e -> liftEffect (Consola.warn ("invalidateStats failed: " <> message e))
      Right _ -> pure unit
