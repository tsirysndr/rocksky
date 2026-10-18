-- | Per-IP rate limiting on Redis (`src/ratelimiter.ts`).
module Rocksky.Ratelimiter (rateLimiter, RateLimitOptions) where

import Prelude

import Control.Alt ((<|>))
import Data.Int (fromString)
import Data.Maybe (Maybe(..), fromMaybe)
import Effect.Class (liftEffect)
import Hono (Middleware)
import Hono as Hono
import Redis as Redis
import Rocksky.Context (Context)
import Rocksky.Lib.Foreign (asInt, asString)

type RateLimitOptions = { limit :: Int, window :: Int, keyPrefix :: String }

-- INCR and EXPIRE must be one atomic step: setting the expiry in a separate
-- round-trip means a failure between the two leaves a counter with no TTL,
-- which blocks that IP forever. The TTL < 0 branch also heals any such key
-- left behind by older code.
incrWithWindow :: String
incrWithWindow =
  """
local current = redis.call('INCR', KEYS[1])
if current == 1 or redis.call('TTL', KEYS[1]) < 0 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return current
"""

rateLimiter :: Context -> RateLimitOptions -> Middleware
rateLimiter ctx { limit, window, keyPrefix } c next = do
  let
    ip = fromMaybe "" (Hono.reqHeader c "x-forwarded-for" <|> Hono.reqRawHeader c "x-real-ip" <|> Hono.reqRawHeader c "host")
    key = keyPrefix <> ":" <> ip
  if ip == "161.97.141.205" then next $> Nothing
  else do
    result <- Redis.eval ctx.redis incrWithWindow [ key ] [ show window ]
    let
      current = fromMaybe 0 (asInt result <|> (asString result >>= fromString))
      remaining = limit - current
    liftEffect do
      Hono.setHeader c "X-RateLimit-Limit" (show limit)
      Hono.setHeader c "X-RateLimit-Remaining" (show (max remaining 0))
    if current > limit then do
      reset <- Redis.ttl ctx.redis key
      liftEffect do
        Hono.status c 429
        Hono.setHeader c "X-RateLimit-Reset" (show reset)
        Just <$> Hono.text c "Too Many Requests"
    else next $> Nothing
