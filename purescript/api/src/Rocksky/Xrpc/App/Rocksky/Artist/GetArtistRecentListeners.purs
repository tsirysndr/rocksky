module Rocksky.Xrpc.App.Rocksky.Artist.GetArtistRecentListeners (register, retrieve) where

import Prelude
import Atproto.XrpcServer as Xrpc
import Data.Array (catMaybes, foldl, head, mapMaybe, null)
import Data.Either (Either(..))
import Data.JSDate (JSDate)
import Data.JSDate as Date
import Data.Map as Map
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Nullable (Nullable, toMaybe)
import Data.Traversable (traverse)
import Data.Tuple (Tuple(..))
import Drizzle.Builder (groupBy, limit, offset, orderBy, run, selectFieldsFrom)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (toSQL)
import Effect (Effect)
import Effect.Aff (Aff, attempt, error, throwError)
import Effect.Class (liftEffect)
import Foreign (Foreign)
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Lib.Aff (recoverWith, retryTransientDb, timeoutMs)
import Rocksky.Lib.Error (describeError)
import Rocksky.Lib.Foreign (toForeign)
import Rocksky.Schema as T
import Rocksky.Xrpc.Util as Util

type QueryParams = { uri :: String, limit :: Nullable Int, offset :: Nullable Int }
type Listener = { id :: String, avatar :: String, did :: String, displayName :: Nullable String, handle :: String }
type RecentScrobble = { userId :: Nullable String, uri :: Nullable String, timestamp :: JSDate }

retrieve :: Context -> QueryParams -> Aff (Array Foreign)
retrieve ctx params = do
  result <- attempt do
    artists :: Array { id :: String } <- run ctx.db (selectFieldsFrom { id: toSQL T.artistsC.id } T.artists
      # where_ (SQL.eq (toSQL T.artistsC.uri) (SQL.string params.uri)))
    case head artists of
      Nothing -> pure []
      Just artist -> do
        latest :: Array { userId :: Nullable String, lastTimestamp :: Nullable JSDate } <- run ctx.db
          (selectFieldsFrom { userId: toSQL T.scrobblesC.userId, lastTimestamp: SQL.max (toSQL T.scrobblesC.timestamp) } T.scrobbles
            # where_ (SQL.eq (toSQL T.scrobblesC.artistId) (SQL.string artist.id))
            # groupBy [toSQL T.scrobblesC.userId] # orderBy [SQL.desc (SQL.max (toSQL T.scrobblesC.timestamp))]
            # limit (fromMaybe 20 (toMaybe params.limit)) # offset (fromMaybe 0 (toMaybe params.offset)))
        if null latest then pure [] else do
          let ids = map SQL.string (mapMaybe (toMaybe <<< _.userId) latest)
          users :: Array Listener <- run ctx.db (selectFieldsFrom
            { id: toSQL T.usersC.id, avatar: toSQL T.usersC.avatar, did: toSQL T.usersC.did, displayName: toSQL T.usersC.displayName, handle: toSQL T.usersC.handle } T.users
            # where_ (SQL.inArray (toSQL T.usersC.id) ids))
          scrobbles :: Array RecentScrobble <- run ctx.db (selectFieldsFrom
            { userId: toSQL T.scrobblesC.userId, uri: toSQL T.scrobblesC.uri, timestamp: toSQL T.scrobblesC.timestamp } T.scrobbles
            # where_ (SQL.and (SQL.eq (toSQL T.scrobblesC.artistId) (SQL.string artist.id)) (SQL.inArray (toSQL T.scrobblesC.userId) ids)))
          let userMap = Map.fromFoldable (map (\u -> Tuple u.id u) users)
              recent = foldl newest Map.empty scrobbles
          catMaybes <$> traverse (\item -> case toMaybe item.userId, toMaybe item.lastTimestamp of
            Just id, Just time | id /= "" -> case Map.lookup id userMap of
              Nothing -> pure Nothing
              Just user -> do
                timestamp <- liftEffect (Date.toISOString time)
                pure (Just (toForeign
                  { id: user.id, did: user.did, handle: user.handle, displayName: fromMaybe "" (toMaybe user.displayName), avatar: user.avatar
                  , timestamp, scrobbleUri: fromMaybe "" (Map.lookup id recent >>= toMaybe <<< _.uri) }))
            _, _ -> pure Nothing) latest
  case result of
    Right rows -> pure rows
    Left e -> throwError (error ("Failed to retrieve artist's recent listeners: " <> describeError e))
  where
  newest acc row = case toMaybe row.userId of
    Just id | id /= "" -> case Map.lookup id acc of
      Just previous | Date.getTime previous.timestamp >= Date.getTime row.timestamp -> acc
      _ -> Map.insert id row acc
    _ -> acc

register :: Server -> Context -> Effect Unit
-- The source runs Cache.make anew on each request; no entries survive a call.
register server ctx = Xrpc.method server "app.rocksky.artist.getArtistRecentListeners"
  { auth: Nothing
  , handler: \input -> do
      listeners <- recoverWith [] (timeoutMs 10000 (retryTransientDb (retrieve ctx (Util.params input))))
      pure (Util.json { listeners })
  }
