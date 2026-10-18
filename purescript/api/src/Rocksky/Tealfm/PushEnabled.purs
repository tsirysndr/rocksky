module Rocksky.Tealfm.PushEnabled (resolvePushEnabled, readPushEnabled, isTealPushEnabled) where

import Prelude
import Data.Array (head)
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Nullable (Nullable, toMaybe, toNullable)
import Data.String (Pattern(..), contains)
import Drizzle.Builder (innerJoin, limit, run, selectFieldsFrom)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (toSQL)
import Effect.Aff (Aff)
import Rocksky.Context (Context)
import Rocksky.Lib.Env (env)
import Rocksky.Schema as T

resolvePushEnabled :: Nullable Boolean -> Maybe String -> Boolean
resolvePushEnabled stored did = fromMaybe defaultEnabled (toMaybe stored)
  where
  defaultEnabled = case did of
    Just value | value /= "" -> not (contains (Pattern value) env."DISABLED_TEALFM")
    _ -> true

readPushEnabled :: Context -> String -> Aff (Nullable Boolean)
readPushEnabled ctx did = do
  rows :: Array { pushEnabled :: Nullable Boolean } <- run ctx.db
    ( selectFieldsFrom { pushEnabled: toSQL T.mirrorSourcesC.pushEnabled } T.mirrorSources
        # innerJoin T.users (SQL.eq (toSQL T.mirrorSourcesC.userId) (toSQL T.usersC.id))
        # where_ (SQL.and (SQL.eq (toSQL T.usersC.did) (SQL.string did)) (SQL.eq (toSQL T.mirrorSourcesC.provider) (SQL.string "tealfm")))
        # limit 1
    )
  pure (toNullable (head rows >>= toMaybe <<< _.pushEnabled))

isTealPushEnabled :: Context -> String -> Aff Boolean
isTealPushEnabled ctx did = flip resolvePushEnabled (Just did) <$> readPushEnabled ctx did
