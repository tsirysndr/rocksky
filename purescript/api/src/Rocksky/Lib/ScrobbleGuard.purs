-- | Bot-scrobble guard (`src/lib/scrobbleGuard.ts`).
-- |
-- | A real listener cannot scrobble *distinct* tracks faster than the tracks
-- | physically play, so a per-user rolling window of *accepted* scrobbles is a
-- | clean bot fingerprint. Tunable via env:
-- |   SCROBBLE_ABUSE_WINDOW  rolling window, seconds        (default 1800)
-- |   SCROBBLE_ABUSE_MAX     max accepted scrobbles/window  (default 25; 0 disables)
-- |   SCROBBLE_ABUSE_BLOCK   temp block duration, seconds   (default 3600)
module Rocksky.Lib.ScrobbleGuard
  ( ScrobbleGuardError(..)
  , toError
  , fromError
  , scrobbleBlockedMessage
  , scrobbleBotFlaggedMessage
  , assertNotBotFlagged
  , assertNotScrobbleBlocked
  , recordScrobbleAndGuard
  ) where

import Prelude

import Control.Alt ((<|>))
import Data.Array (head, index)
import Data.Int (ceil, fromString, round, toNumber)
import Data.Maybe (Maybe(..), fromMaybe)
import Drizzle.Builder (limit, run, selectFieldsFrom)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (toSQL)
import Effect.Aff (Aff, Error, throwError)
import Effect.Class (liftEffect)
import Node.Crypto (randomUUID)
import Redis as Redis
import Rocksky.Context (Context)
import Rocksky.Lib.Env (env)
import Rocksky.Lib.Error (errorField, errorName, errorToForeign)
import Rocksky.Lib.Foreign (asInt, asString, readIntAt)
import Rocksky.Schema as T

data ScrobbleGuardError
  -- | A persistent `is_bot` flag, set by the offline scrobble-abuse-sweep
  -- | service and cleared only by an operator.
  = ScrobbleBotFlagged { did :: String }
  -- | A temporary block from the rolling window; `retryAfter` in seconds.
  | ScrobbleBlocked { did :: String, retryAfter :: Int }

foreign import mkError :: String -> String -> String -> Int -> Error

toError :: ScrobbleGuardError -> Error
toError = case _ of
  ScrobbleBotFlagged { did } -> mkError "ScrobbleBotFlaggedError" ("Scrobble temporarily blocked for " <> did <> " (retry after 0s)") did 0
  ScrobbleBlocked { did, retryAfter } -> mkError "ScrobbleBlockedError" ("Scrobble temporarily blocked for " <> did <> " (retry after " <> show retryAfter <> "s)") did retryAfter

fromError :: Error -> Maybe ScrobbleGuardError
fromError e = case errorName e, errorField e "did", errorField e "retryAfter" of
  "ScrobbleBotFlaggedError", Just did, _ -> Just (ScrobbleBotFlagged { did })
  "ScrobbleBlockedError", Just did, retry -> Just (ScrobbleBlocked { did, retryAfter: fromMaybe 0 (readIntAt "retryAfter" (errorToForeign e) <|> (retry >>= fromString)) })
  _, _, _ -> Nothing

windowSeconds :: Int
windowSeconds = round env."SCROBBLE_ABUSE_WINDOW"

maxInWindow :: Int
maxInWindow = round env."SCROBBLE_ABUSE_MAX"

blockSeconds :: Int
blockSeconds = round env."SCROBBLE_ABUSE_BLOCK"

blockKey :: String -> String
blockKey did = "scrobble:block:" <> did

rateKey :: String -> String
rateKey did = "scrobble:rate:" <> did

-- | Human-readable explanation returned to a suspected bot on both scrobble
-- | entry points (429 on /now-playing, XRPC error on createScrobble).
scrobbleBlockedMessage :: Int -> String
scrobbleBlockedMessage retryAfterSeconds =
  let minutes = max 1 (ceil (toNumber retryAfterSeconds / 60.0))
  in
    "Your account has been temporarily blocked from scrobbling because we detected "
      <> "an abnormally high scrobble rate — scrobbles are arriving faster than tracks can "
      <> "physically be played, which is a pattern typical of bots or misconfigured clients. "
      <> "Normal listening never triggers this. To resume, submit one scrobble per track only "
      <> "after it has actually played (roughly half its length or ~4 minutes, as Last.fm does), "
      <> "rather than on a fixed short timer. If you believe this is a mistake, contact "
      <> "support@rocksky.app. You can retry in about " <> show minutes <> " minute(s)."

scrobbleBotFlaggedMessage :: String
scrobbleBotFlaggedMessage =
  "Your account has been flagged as a bot and can no longer scrobble. This "
    <> "happens when scrobbles arrive continuously, around the clock, faster than "
    <> "tracks can physically be played — a pattern real listening never produces. "
    <> "If you believe this is a mistake, contact support@rocksky.app to have it reviewed."

-- | Reject if the user carries the persistent `is_bot` flag: one indexed
-- | lookup on the scrobble path, in addition to the rolling-window guard.
assertNotBotFlagged :: Context -> String -> Aff Unit
assertNotBotFlagged ctx did = do
  rows :: Array { isBot :: Boolean } <- run ctx.db
    ( selectFieldsFrom { isBot: toSQL T.usersC.isBot } T.users
        # where_ (SQL.eq (toSQL T.usersC.did) (SQL.string did))
        # limit 1
    )
  case head rows of
    Just { isBot: true } -> throwError (toError (ScrobbleBotFlagged { did }))
    _ -> pure unit

-- | Reject early if the user is currently under a temporary block, before any
-- | DB work so blocked bots don't hit Postgres at all.
assertNotScrobbleBlocked :: Context -> String -> Aff Unit
assertNotScrobbleBlocked ctx did
  | maxInWindow <= 0 = pure unit
  | otherwise = do
      ttl <- Redis.ttl ctx.redis (blockKey did)
      when (ttl > 0) $ throwError (toError (ScrobbleBlocked { did, retryAfter: ttl }))

-- | Record an accepted scrobble in the user's rolling window keyed by scrobble
-- | time; block and throw once MAX_IN_WINDOW is exceeded. Call only for
-- | genuinely new scrobbles (after dedup) so now-playing pings don't inflate it.
recordScrobbleAndGuard :: Context -> String -> Number -> Maybe String -> Aff Unit
recordScrobbleAndGuard ctx did scrobbleTimeUnix submissionId
  | maxInWindow <= 0 = pure unit
  | otherwise = do
      let
        key = rateKey did
        nowMs = scrobbleTimeUnix * 1000.0
        windowStartMs = nowMs - toNumber windowSeconds * 1000.0
      member <- case submissionId of
        Just s -> pure s
        Nothing -> liftEffect randomUUID
      -- Atomically: add this scrobble, drop anything older than the window,
      -- count what's left, and keep the key from lingering past the window.
      m <- liftEffect (Redis.multi ctx.redis)
      _ <- liftEffect (Redis.zAdd m key nowMs (show (round nowMs) <> ":" <> member))
      _ <- liftEffect (Redis.zRemRangeByScore m key 0.0 windowStartMs)
      _ <- liftEffect (Redis.zCard m key)
      _ <- liftEffect (Redis.multiExpire m key windowSeconds)
      results <- Redis.exec m
      -- zCard is the third command in the pipeline.
      let count = fromMaybe 0 (index results 2 >>= \r -> asInt r <|> (asString r >>= fromString))
      when (count > maxInWindow) do
        Redis.setEx ctx.redis (blockKey did) blockSeconds "1"
        throwError (toError (ScrobbleBlocked { did, retryAfter: blockSeconds }))
