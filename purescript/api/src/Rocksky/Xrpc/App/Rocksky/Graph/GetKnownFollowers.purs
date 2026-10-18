module Rocksky.Xrpc.App.Rocksky.Graph.GetKnownFollowers (register, retrieve) where

import Prelude
import Atproto.XrpcServer as Xrpc
import Data.Array (head, last)
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Nullable (Nullable, toMaybe)
import Data.Traversable (traverse)
import Drizzle.Builder (innerJoin, limit, orderBy, run, selectFieldsFrom, selectFrom)
import Drizzle.Database (Database)
import Drizzle.Dialect (Postgres)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (tableSQL, toSQL)
import Effect (Effect)
import Effect.Aff (Aff)
import Effect.Class (liftEffect)
import Foreign (Foreign)
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Lib.Aff (recoverWith, retryTransientDb, timeoutMs)
import Rocksky.Lib.DbQuery (dbQuery)
import Rocksky.Lib.Foreign (toForeign)
import Rocksky.Schema as T
import Rocksky.Schema.Follows (SelectFollows)
import Rocksky.Schema.Users (SelectUser)
import Rocksky.Xrpc.App.Rocksky.Graph.Common (profile, subjectView, cursorCondition, cursorView)
import Rocksky.Xrpc.Util as Util

type QueryParams = { actor :: String, limit :: Nullable Int, cursor :: Nullable String }

retrieve :: Database Postgres -> QueryParams -> String -> Aff Foreign
retrieve db params did = do
  users :: Array SelectUser <- run db (selectFrom T.users # where_ (SQL.eq (toSQL T.usersC.did) (SQL.string params.actor)))
  let base = SQL.and (SQL.eq (toSQL T.followsC.subject_did) (SQL.string params.actor))
        (SQL.template ["EXISTS (SELECT 1 FROM ", " f2 WHERE f2.subject_did = ", " AND f2.follower_did = ", ")"]
          [tableSQL T.follows, toSQL T.usersC.did, SQL.string did])
      condition = fromMaybe base (SQL.andAll ([base] <> cursorCondition params.cursor))
  rows :: Array { users :: SelectUser, follows :: SelectFollows } <- run db
    (selectFieldsFrom { users: tableSQL T.users, follows: tableSQL T.follows } T.follows
      # innerJoin T.users (SQL.eq (toSQL T.usersC.did) (toSQL T.followsC.follower_did))
      # where_ condition # orderBy [SQL.desc (toSQL T.followsC.createdAt)] # limit (fromMaybe 50 (toMaybe params.limit)))
  subject <- liftEffect (subjectView (head users))
  followers <- liftEffect (traverse (profile <<< _.users) rows)
  pure (toForeign { subject, followers, cursor: cursorView (_.createdAt <<< _.follows <$> last rows) })

register :: Server -> Context -> Effect Unit
register server ctx = Xrpc.method server "app.rocksky.graph.getKnownFollowers"
  { auth: Just ctx.authVerifier
  , handler: \input -> do
      let empty = toForeign { subject: {}, followers: ([] :: Array Foreign) }
      body <- recoverWith empty $ timeoutMs 120000 $ retryTransientDb case Util.authDid input of
        Just did | did /= "" -> dbQuery ctx.pools "Failed to retrieve known followers" \db -> retrieve db (Util.params input) did
        _ -> pure empty
      pure (Xrpc.Json body)
  }
