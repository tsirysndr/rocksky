module Rocksky.Notifications.SongActivity where

import Prelude
import Data.Array (filter, nub)
import Data.Maybe (Maybe(..))
import Data.Nullable (notNull, null, toNullable)
import Drizzle.Builder (groupBy, innerJoin, limit, run, selectFieldsFrom)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (toSQL)
import Effect.Aff (Aff)
import Rocksky.Context (Context)
import Rocksky.Lib.Aff (recoverWith)
import Rocksky.Notifications.Service (createNotification, createNotifications)
import Rocksky.Playlists.Service (atUriRepo)
import Rocksky.Schema as T

songRecipients :: Context -> String -> String -> Aff (Array String)
songRecipients ctx trackId uri = do
  owners :: Array { id :: String } <- run ctx.db (selectFieldsFrom { id: toSQL T.usersC.id } T.users # where_ (SQL.eq (toSQL T.usersC.did) (SQL.string (atUriRepo uri))) # limit 1)
  lovers :: Array { id :: String } <- run ctx.db
    (selectFieldsFrom { id: toSQL T.usersC.id } T.lovedTracks
      # innerJoin T.users (SQL.eq (toSQL T.lovedTracksC.userId) (toSQL T.usersC.id))
      # where_ (SQL.eq (toSQL T.lovedTracksC.trackId) (SQL.string trackId))
      # groupBy [toSQL T.usersC.id])
  pure (nub (map _.id (owners <> lovers)))

notifySongLike :: Context -> String -> String -> String -> Aff Unit
notifySongLike ctx trackId uri actorId = recoverWith unit do
  ids <- songRecipients ctx trackId uri
  void $ createNotifications ctx ids { userId: null, actorId: notNull actorId, type: "like_scrobble", shoutId: null, subjectUri: notNull uri }

notifySongShout :: Context -> String -> String -> String -> String -> Maybe String -> Aff (Array String)
notifySongShout ctx trackId uri actorId shoutId replyTo = recoverWith [] do
  ids <- songRecipients ctx trackId uri
  authors :: Array { id :: String } <- run ctx.db
    (selectFieldsFrom { id: toSQL T.usersC.id } T.shouts
      # innerJoin T.users (SQL.eq (toSQL T.shoutsC.authorId) (toSQL T.usersC.id))
      # where_ (SQL.eq (toSQL T.shoutsC.trackId) (SQL.string trackId))
      # groupBy [toSQL T.usersC.id])
  let recipients = nub (ids <> map _.id authors)
  void $ createNotifications ctx (filter (\id -> Just id /= replyTo) recipients) { userId: null, actorId: notNull actorId, type: "comment_scrobble", shoutId: notNull shoutId, subjectUri: notNull uri }
  void $ createNotification ctx { userId: toNullable replyTo, actorId: notNull actorId, type: "reply", shoutId: notNull shoutId, subjectUri: notNull uri }
  pure (nub (recipients <> case replyTo of
    Just id -> [id]
    Nothing -> []))
