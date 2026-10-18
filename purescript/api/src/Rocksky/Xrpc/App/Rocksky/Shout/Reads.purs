module Rocksky.Xrpc.App.Rocksky.Shout.Reads (Kind(..), retrieve, replies) where

import Prelude
import Atproto.XrpcServer (HandlerInput)
import Data.Array (head)
import Data.JSDate (toISOString)
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Nullable (toNullable)
import Data.Traversable (for)
import Drizzle.Builder (aliasTable, groupBy, leftJoin, orderBy, run, selectFieldsFrom)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (columns, tableSQL, toSQL)
import Effect.Aff (Aff)
import Effect.Class (liftEffect)
import Foreign (Foreign)
import Rocksky.Context (Context)
import Rocksky.Lib.DbQuery (dbQuery)
import Rocksky.Lib.Foreign (mergeForeign, toForeign)
import Rocksky.Schema as T
import Rocksky.Schema.Shouts (SelectShout)
import Rocksky.Schema.Users (SelectUser)
import Rocksky.Xrpc.App.Rocksky.Shout.Util (ShoutRow, presentShouts)
import Rocksky.Xrpc.Util (authDid, paramString)

data Kind = Album | Artist | Track | Profile

retrieve :: Kind -> Context -> HandlerInput -> Aff Foreign
retrieve kind ctx input = do
  let key = case kind of
        Profile -> "did"
        _ -> "uri"
  let target = fromMaybe "" (paramString input key)
  user <- dbQuery ctx.pools "Failed to retrieve current user" \db -> do
    let condition = case kind of
          Profile -> SQL.or (SQL.eq (toSQL T.usersC.did) (SQL.string target)) (SQL.eq (toSQL T.usersC.handle) (SQL.string target))
          -- The TypeScript track handler uses this literal rather than caller auth.
          Track -> SQL.eq (toSQL T.usersC.did) (SQL.string "did")
          _ -> SQL.eq (toSQL T.usersC.did) (SQL.param (toNullable (authDid input)))
    rows :: Array { id :: String } <- run db (selectFieldsFrom { id: toSQL T.usersC.id } T.users # where_ condition)
    pure (head rows)
  rows :: Array ShoutRow <- dbQuery ctx.pools "Failed to retrieve shouts" \db -> do
    let base = toForeign { id: toSQL T.shoutsC.id, content: toSQL T.shoutsC.content, createdAt: toSQL T.shoutsC.createdAt, uri: toSQL T.shoutsC.uri, parent: toSQL T.shoutsC.parentId, likes: SQL.as "likes" (SQL.countOf (toSQL T.shoutLikesC.id)) }
    let flags = case user of
          Nothing -> toForeign {}
          Just u -> case kind of
            Profile -> toForeign { liked: liked u.id, reported: reported u.id }
            _ -> toForeign { liked: liked u.id }
    let shouts = mergeForeign base flags
    let users = { id: toSQL T.usersC.id, did: toSQL T.usersC.did, handle: toSQL T.usersC.handle, displayName: toSQL T.usersC.displayName, avatar: toSQL T.usersC.avatar }
    case kind of
      Profile -> do
        let authors = aliasTable T.users "authors"
        let ac = columns authors
        run db
          (selectFieldsFrom { shouts, users: { id: toSQL ac.id, did: toSQL ac.did, handle: toSQL ac.handle, displayName: toSQL ac.displayName, avatar: toSQL ac.avatar } } T.profileShouts
            # leftJoin T.shouts (SQL.eq (toSQL T.profileShoutsC.shoutId) (toSQL T.shoutsC.id))
            # leftJoin authors (SQL.eq (toSQL T.shoutsC.authorId) (toSQL ac.id))
            # leftJoin T.users (SQL.eq (toSQL T.profileShoutsC.userId) (toSQL T.usersC.id))
            # leftJoin T.shoutLikes (SQL.eq (toSQL T.shoutsC.id) (toSQL T.shoutLikesC.shoutId))
            # where_ (SQL.or (SQL.eq (toSQL T.usersC.did) (SQL.string target)) (SQL.eq (toSQL T.usersC.handle) (SQL.string target)))
            # groupBy (groupColumns <> [toSQL T.profileShoutsC.id, toSQL T.profileShoutsC.createdAt, toSQL ac.id, toSQL ac.did, toSQL ac.handle, toSQL ac.displayName, toSQL ac.avatar])
            # orderBy [SQL.desc (toSQL T.profileShoutsC.createdAt)])
      _ -> do
        let baseQuery = selectFieldsFrom { shouts, users } T.shouts
              # leftJoin T.users (SQL.eq (toSQL T.shoutsC.authorId) (toSQL T.usersC.id))
              # leftJoin T.shoutLikes (SQL.eq (toSQL T.shoutsC.id) (toSQL T.shoutLikesC.shoutId))
        let query = case kind of
              Album -> baseQuery # leftJoin T.albums (SQL.eq (toSQL T.shoutsC.albumId) (toSQL T.albumsC.id)) # where_ (SQL.eq (toSQL T.albumsC.uri) (SQL.string target))
              Artist -> baseQuery # leftJoin T.artists (SQL.eq (toSQL T.shoutsC.artistId) (toSQL T.artistsC.id)) # where_ (SQL.eq (toSQL T.artistsC.uri) (SQL.string target))
              _ -> baseQuery # leftJoin T.tracks (SQL.eq (toSQL T.shoutsC.trackId) (toSQL T.tracksC.id)) # where_ (SQL.eq (toSQL T.tracksC.uri) (SQL.string target))
        run db (query # groupBy groupColumns # orderBy [SQL.desc (toSQL T.shoutsC.createdAt)])
  presentShouts rows
  where
  liked id = SQL.as "liked" (SQL.template ["EXISTS (SELECT 1 FROM ", " WHERE ", " = ", " AND ", " = ", ")"] [tableSQL T.shoutLikes, toSQL T.shoutLikesC.shoutId, toSQL T.shoutsC.id, toSQL T.shoutLikesC.userId, SQL.string id])
  reported id = SQL.as "reported" (SQL.template ["EXISTS (SELECT 1 FROM ", " WHERE ", " = ", " AND ", " = ", ")"] [tableSQL T.shoutReports, toSQL T.shoutReportsC.shoutId, toSQL T.shoutsC.id, toSQL T.shoutReportsC.userId, SQL.string id])
  groupColumns = [toSQL T.shoutsC.id, toSQL T.shoutsC.content, toSQL T.shoutsC.createdAt, toSQL T.shoutsC.uri, toSQL T.shoutsC.parentId, toSQL T.usersC.id, toSQL T.usersC.did, toSQL T.usersC.handle, toSQL T.usersC.displayName, toSQL T.usersC.avatar]

replies :: Context -> HandlerInput -> Aff Foreign
replies ctx input = do
  rows :: Array { shouts :: SelectShout, users :: SelectUser } <- dbQuery ctx.pools "Failed to retrieve shout replies" \db -> run db
    (selectFieldsFrom { shouts: tableSQL T.shouts, users: tableSQL T.users } T.shouts
      # leftJoin T.users (SQL.eq (toSQL T.shoutsC.authorId) (toSQL T.usersC.id))
      # where_ (SQL.eq (toSQL T.shoutsC.parentId) (SQL.string (fromMaybe "" (paramString input "uri"))))
      # orderBy [SQL.asc (toSQL T.shoutsC.createdAt)])
  shouts <- for rows \row -> do
    createdAt <- liftEffect (toISOString row.shouts.createdAt)
    pure { id: row.shouts.id, content: row.shouts.content, parent: row.shouts.parentId, uri: row.shouts.uri, createdAt, author: { id: row.users.id, did: row.users.did, handle: row.users.handle, displayName: row.users.displayName, avatar: row.users.avatar } }
  pure (toForeign { shouts })
