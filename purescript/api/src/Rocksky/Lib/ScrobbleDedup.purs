-- | One sorted set per listener/song, with listening time as the score. The
-- | check and reservation are atomic, including timestamps on either side of
-- | a minute boundary. Never prune by listening time: imports arrive unordered.
-- | The TTL bridges PDS publication and asynchronous Jetstream indexing; the
-- | database check remains the durable deduplication layer.
module Rocksky.Lib.ScrobbleDedup (reserveScrobble) where

import Prelude

import Data.Int (fromString, round)
import Data.Maybe (Maybe(..), fromMaybe)
import Data.String (toLower)
import Effect.Aff (Aff)
import Effect.Class (liftEffect)
import Node.Crypto (randomUUID, sha256Hex)
import Redis (Client)
import Redis as Redis
import Rocksky.Lib.Foreign (asInt, asString, stringify, toForeign)

reserveScript :: String
reserveScript =
  """
local at = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
if redis.call('ZSCORE', KEYS[1], ARGV[3]) then
  redis.call('EXPIRE', KEYS[1], 300)
  return 1
end
if redis.call('ZCOUNT', KEYS[1], at - window, at + window) > 0 then
  return 0
end
redis.call('ZADD', KEYS[1], at, ARGV[3])
redis.call('EXPIRE', KEYS[1], 300)
return 1
"""

reserveScrobble :: Client -> String -> { title :: String, artist :: String, timestamp :: Number } -> Int -> Maybe String -> Aff Boolean
reserveScrobble redis did track windowSeconds owner = do
  let identity = sha256Hex (stringify (toForeign [ toLower track.title, toLower track.artist ]))
  member <- case owner of
    Just o -> pure o
    Nothing -> liftEffect randomUUID
  result <- Redis.eval redis reserveScript
    [ "scrobble-window:v1:" <> did <> ":" <> identity ]
    [ show (round track.timestamp), show windowSeconds, member ]
  let n = fromMaybe 0 (case asInt result of
        Just i -> Just i
        Nothing -> asString result >>= fromString)
  pure (n == 1)
