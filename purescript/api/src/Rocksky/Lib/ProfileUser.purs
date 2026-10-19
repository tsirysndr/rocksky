module Rocksky.Lib.ProfileUser (save) where

import Prelude
import Data.Array (head)
import Data.Maybe (Maybe(..), fromMaybe)
import Drizzle.Builder (insertForeign, onConflictDoUpdate, runInsertReturning)
import Drizzle.Database (Database)
import Drizzle.Schema (toSQL)
import Drizzle.Dialect (Postgres)
import Effect.Aff (Aff, error, throwError)
import Rocksky.Lib.BskyProfile (ResolvedBskyProfile)
import Rocksky.Lib.Foreign (toForeign, undefined)
import Rocksky.Schema as T
import Rocksky.Schema.Users (SelectUser)

-- Missing metadata defaults to empty text on insert and is omitted on conflict,
-- so a partial fetch never erases a name or avatar already stored in PostgreSQL.
save :: Database Postgres -> String -> String -> ResolvedBskyProfile -> Aff SelectUser
save db did handle fetched = do
  rows <- runInsertReturning db (insertForeign T.users [toForeign
    { did, handle, avatar: fromMaybe "" fetched.avatar, displayName: fromMaybe "" fetched.displayName }]
    # onConflictDoUpdate
      { target: [toSQL T.usersC.did]
      , set:
          { handle
          , displayName: maybeField fetched.displayName
          , avatar: maybeField fetched.avatar
          }
      , where_: Nothing
      })
  case head rows of
    Nothing -> throwError (error "Saved user was not found")
    Just user -> pure user
  where
  maybeField = case _ of
    Nothing -> undefined
    Just value -> toForeign value
