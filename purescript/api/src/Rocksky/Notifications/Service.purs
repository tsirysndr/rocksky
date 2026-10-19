module Rocksky.Notifications.Service where

import Prelude
import Data.Array (filter, head, last, length, mapMaybe, null, take, nub, drop, zipWith)
import Data.Either (Either(..))
import Data.JSDate (now, parse, toISOString)
import Data.Map as Map
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Nullable (Nullable, notNull, toMaybe, toNullable)
import Data.String (Pattern(..), contains)
import Data.String.Regex (regex, replace)
import Data.String.Regex.Flags (global)
import Data.Traversable (for, for_, traverse)
import Data.Tuple (Tuple(..))
import Drizzle.Builder (groupBy, insertForeign, leftJoin, limit, orderBy, run, runInsertReturning, runUpdate, selectFieldsFrom, selectFrom, update)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (toSQL)
import Effect.Aff (Aff)
import Effect.Class (liftEffect)
import Foreign (Foreign)
import Nats as Nats
import Rocksky.Context (Context)
import Rocksky.Lib.Aff (recoverWith)
import Rocksky.Lib.Common (withFallbackAlbumArt)
import Rocksky.Lib.Foreign (omitNulls, stringify, toForeign)
import Rocksky.Schema as T
import Rocksky.Schema.Notifications (SelectNotification)
import Rocksky.Schema.Users (SelectUser)

notificationSubject :: String -> String
notificationSubject userId = "rocksky.notification." <> case regex "[^A-Za-z0-9_-]" global of
  Right re -> replace re "_" userId
  Left _ -> userId

publish :: Context -> String -> Foreign -> Aff Unit
publish ctx userId payload = recoverWith unit $ liftEffect (Nats.publishString ctx.nc (notificationSubject userId) (stringify payload))

type CreateNotificationParams = { userId :: Nullable String, actorId :: Nullable String, type :: String, shoutId :: Nullable String, subjectUri :: Nullable String }

createNotification :: Context -> CreateNotificationParams -> Aff (Maybe SelectNotification)
createNotification ctx params = head <$> createNotifications ctx (fromMaybe [] (map pure (toMaybe params.userId))) params

createNotifications :: Context -> Array String -> CreateNotificationParams -> Aff (Array SelectNotification)
createNotifications ctx recipientIds params = recoverWith [] case toMaybe params.actorId of
  Just actorId | actorId /= "" -> batches actorId (nub (filter (\id -> id /= "" && id /= actorId) recipientIds))
  _ -> pure []
  where
  batches _ [] = pure []
  batches actorId ids = do
    let batch = take 200 ids
    createdAt <- liftEffect now
    created :: Array SelectNotification <- runInsertReturning ctx.db (insertForeign T.notifications (map (\userId -> toForeign { userId, actorId, type: params.type, shoutId: params.shoutId, subjectUri: params.subjectUri, createdAt }) batch))
    counts :: Array { userId :: String, count :: Int } <- run ctx.db
      (selectFieldsFrom { userId: toSQL T.notificationsC.userId, count: SQL.count } T.notifications
        # where_ (SQL.and (SQL.inArray (toSQL T.notificationsC.userId) (map SQL.string batch)) (SQL.eq (toSQL T.notificationsC.read) (SQL.bool false)))
        # groupBy [toSQL T.notificationsC.userId])
    let unreadCounts = Map.fromFoldable (map (\row -> Tuple row.userId row.count) counts)
    views <- hydrate ctx created
    for_ (zipWith Tuple created views) \(Tuple row view) ->
      publish ctx row.userId (omitNulls (toForeign { type: "notification", notification: view, unreadCount: fromMaybe 0 (Map.lookup row.userId unreadCounts) }))
    rest <- batches actorId (drop 200 ids)
    pure (created <> rest)

getUnreadCount :: Context -> String -> Aff Int
getUnreadCount ctx userId = do
  rows :: Array { count :: Int } <- run ctx.db (selectFieldsFrom { count: SQL.raw "count(*)::int" } T.notifications # where_ (unread userId))
  pure (fromMaybe 0 (_.count <$> head rows))

unread :: String -> SQL.SQL
unread userId = SQL.and (SQL.eq (toSQL T.notificationsC.userId) (SQL.string userId)) (SQL.eq (toSQL T.notificationsC.read) (SQL.bool false))

listNotifications :: Context -> String -> { limit :: Maybe Int, cursor :: Maybe String } -> Aff Foreign
listNotifications ctx userId opts = do
  let size = min 100 (max 1 (fromMaybe 30 opts.limit))
  let base = SQL.eq (toSQL T.notificationsC.userId) (SQL.string userId)
  condition <- case opts.cursor of
    Just cursor | cursor /= "" -> do
      date <- liftEffect (parse cursor)
      pure (SQL.and base (SQL.lt (toSQL T.notificationsC.createdAt) (SQL.param date)))
    _ -> pure base
  rows :: Array SelectNotification <- run ctx.db (selectFrom T.notifications # where_ condition # orderBy [ SQL.desc (toSQL T.notificationsC.createdAt) ] # limit (size + 1))
  let hasMore = length rows > size
  let page = take size rows
  notifications <- hydrate ctx page
  cursor <- if hasMore then liftEffect (traverse (toISOString <<< _.createdAt) (last page)) else pure Nothing
  pure (omitNulls (toForeign { notifications, cursor: toNullable cursor }))

markSeen :: Context -> String -> Array String -> Aff Int
markSeen ctx userId ids = do
  readAt <- liftEffect now
  let condition = if null ids then unread userId else SQL.and (unread userId) (SQL.inArray (toSQL T.notificationsC.id) (map SQL.string ids))
  runUpdate ctx.db (update T.notifications { read: true, readAt: notNull readAt } # where_ condition)
  unreadCount <- getUnreadCount ctx userId
  publish ctx userId (toForeign { type: "seen", unreadCount })
  pure unreadCount

hydrate :: Context -> Array SelectNotification -> Aff (Array Foreign)
hydrate _ [] = pure []
hydrate ctx rows = do
  let actorIds = nub (map _.actorId rows)
  let shoutIds = nub (mapMaybe (toMaybe <<< _.shoutId) rows)
  actors :: Array SelectUser <- run ctx.db (selectFrom T.users # where_ (SQL.inArray (toSQL T.usersC.id) (map SQL.string actorIds)))
  shouts :: Array { id :: String, content :: String } <- if null shoutIds then pure [] else run ctx.db (selectFieldsFrom { id: toSQL T.shoutsC.id, content: toSQL T.shoutsC.content } T.shouts # where_ (SQL.inArray (toSQL T.shoutsC.id) (map SQL.string shoutIds)))
  let actorById = Map.fromFoldable (map (\a -> Tuple a.id a) actors)
  let shoutById = Map.fromFoldable (map (\s -> Tuple s.id s.content) shouts)
  subjectByUri <- resolveSubjects ctx rows
  for rows \row -> do
    createdAt <- liftEffect (toISOString row.createdAt)
    let actor = map (\a -> omitNulls (toForeign { id: a.id, did: a.did, handle: a.handle, displayName: a.displayName, avatar: a.avatar })) (Map.lookup row.actorId actorById)
    pure $ omitNulls $ toForeign
      { id: row.id
      , type: row.type
      , read: row.read
      , createdAt
      , subjectUri: row.subjectUri
      , shoutId: row.shoutId
      , shoutContent: toNullable (toMaybe row.shoutId >>= flip Map.lookup shoutById)
      , actor: toNullable actor
      , subject: toNullable (toMaybe row.subjectUri >>= flip Map.lookup subjectByUri)
      }

type SubjectRow = { uri :: Nullable String, title :: Nullable String, artist :: Nullable String, albumArt :: Nullable String }

resolveSubjects :: Context -> Array SelectNotification -> Aff (Map.Map String Foreign)
resolveSubjects ctx rows = do
  let uris = nub (mapMaybe (toMaybe <<< _.subjectUri) rows)
  let scrobbleUris = filter (contains (Pattern "app.rocksky.scrobble")) uris
  let songUris = filter (contains (Pattern "app.rocksky.song")) uris
  let albumUris = filter (contains (Pattern "app.rocksky.album")) uris
  scrobbles :: Array SubjectRow <-
    if null scrobbleUris then pure []
    else run ctx.db
      ( selectFieldsFrom { uri: toSQL T.scrobblesC.uri, title: toSQL T.tracksC.title, artist: toSQL T.tracksC.artist, albumArt: toSQL T.tracksC.albumArt } T.scrobbles
          # leftJoin T.tracks (SQL.eq (toSQL T.scrobblesC.trackId) (toSQL T.tracksC.id))
          # where_ (SQL.inArray (toSQL T.scrobblesC.uri) (map SQL.string scrobbleUris))
      )
  songs :: Array SubjectRow <-
    if null songUris then pure []
    else run ctx.db
      ( selectFieldsFrom { uri: toSQL T.tracksC.uri, title: toSQL T.tracksC.title, artist: toSQL T.tracksC.artist, albumArt: toSQL T.tracksC.albumArt } T.tracks
          # where_ (SQL.inArray (toSQL T.tracksC.uri) (map SQL.string songUris))
      )
  albums :: Array SubjectRow <-
    if null albumUris then pure []
    else run ctx.db
      ( selectFieldsFrom { uri: toSQL T.albumsC.uri, title: toSQL T.albumsC.title, artist: toSQL T.albumsC.artist, albumArt: toSQL T.albumsC.albumArt } T.albums
          # where_ (SQL.inArray (toSQL T.albumsC.uri) (map SQL.string albumUris))
      )
  pure $ Map.fromFoldable $ mapMaybe
    ( \row -> do
        uri <- toMaybe row.uri
        if uri == "" then Nothing else Just (Tuple uri (omitNulls (toForeign { uri, title: row.title, artist: row.artist, albumArt: withFallbackAlbumArt row.albumArt })))
    )
    (scrobbles <> songs <> albums)

userIdForDid :: Context -> Maybe String -> Aff (Maybe String)
userIdForDid _ Nothing = pure Nothing
userIdForDid _ (Just "") = pure Nothing
userIdForDid ctx (Just did) = do
  rows :: Array { id :: String } <- run ctx.db
    ( selectFieldsFrom { id: toSQL T.usersC.id } T.users
        # where_ (SQL.eq (toSQL T.usersC.did) (SQL.string did))
        # limit 1
    )
  pure (_.id <$> head rows)
