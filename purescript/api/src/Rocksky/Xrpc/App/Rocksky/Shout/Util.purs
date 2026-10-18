-- | Pieces shared by the shout and like handlers, which repeat the same
-- | user/agent preamble and `Effect.tryPromise` error wrapping.
module Rocksky.Xrpc.App.Rocksky.Shout.Util
  ( wrapFailure
  , errorString
  , requireDid
  , findUserByDid
  , requireAgent
  , ShoutRow
  , presentShouts
  ) where

import Prelude

import Atproto.Api (Agent)
import Data.Either (Either(..))
import Data.JSDate (JSDate, toISOString)
import Data.Maybe (Maybe(..))
import Drizzle.Builder (limit, run, selectFrom)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (toSQL)
import Effect.Aff (Aff, Error, attempt, error, message, throwError)
import Effect.Class (liftEffect)
import Foreign (Foreign)
import Data.Traversable (traverse)
import Rocksky.Context (Context)
import Rocksky.Lib.Agent (createAgent)
import Rocksky.Lib.Error (errorName)
import Rocksky.Lib.Foreign (mergeForeign, toForeign, unsafeFromForeign)
import Rocksky.Schema (SelectUser)
import Rocksky.Schema as T

-- | `${error}` of a JS Error: "Error: message".
errorString :: Error' -> String
errorString e = case errorName e, message e of
  "", m -> m
  n, "" -> n
  n, m -> n <> ": " <> m

type Error' = Error

-- | `Effect.tryPromise({ try, catch: (error) => new Error(`${prefix}: ${error}`) })`.
wrapFailure :: forall a. String -> Aff a -> Aff a
wrapFailure prefix act = attempt act >>= case _ of
  Right a -> pure a
  Left e -> throwError (error (prefix <> ": " <> errorString e))

requireDid :: Maybe String -> Aff String
requireDid = case _ of
  Just d | d /= "" -> pure d
  _ -> throwError (error "User is not authenticated")

findUserByDid :: Context -> String -> Aff SelectUser
findUserByDid ctx did = do
  rows :: Array SelectUser <- run ctx.db (selectFrom T.users # where_ (SQL.eq (toSQL T.usersC.did) (SQL.string did)) # limit 1)
  case rows of
    [ user ] -> pure user
    _ -> throwError (error "User not found")

requireAgent :: Context -> String -> Aff Agent
requireAgent ctx did = createAgent ctx did >>= case _ of
  Just agent -> pure agent
  Nothing -> throwError (error "Unauthorized")

-- | A row of the `{ shouts: {...}, users: {...} }` projections; `shouts` keeps
-- | exactly the keys selected (`liked`/`reported` only when a viewer is known).
type ShoutRow = { shouts :: Foreign, users :: Foreign }

-- | `{ ...item.shouts, createdAt: item.shouts.createdAt.toISOString(), author: item.users }`.
presentShouts :: Array ShoutRow -> Aff Foreign
presentShouts rows = do
  shouts <- traverse present rows
  pure (toForeign { shouts })
  where
  present item = do
    createdAt <- liftEffect (toISOString (createdAtOf item.shouts))
    pure (mergeForeign item.shouts (toForeign { createdAt, author: item.users }))
  createdAtOf :: Foreign -> JSDate
  createdAtOf s = (unsafeShout s).createdAt
  unsafeShout :: Foreign -> { createdAt :: JSDate }
  unsafeShout = unsafeFromForeign
