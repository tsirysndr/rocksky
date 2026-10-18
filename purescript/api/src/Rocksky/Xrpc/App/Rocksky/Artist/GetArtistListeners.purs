module Rocksky.Xrpc.App.Rocksky.Artist.GetArtistListeners (register, retrieve) where

import Prelude
import Atproto.XrpcServer as Xrpc
import Control.Parallel (parallel, sequential)
import Data.Array (catMaybes, foldl, head, mapMaybe, mapWithIndex, null)
import Data.Map as Map
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Nullable (Nullable, toMaybe)
import Data.Tuple (Tuple(..))
import Drizzle.Builder (groupBy, innerJoin, limit, offset, orderBy, run, selectFieldsFrom)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (toSQL)
import Effect (Effect)
import Effect.Aff (Aff, attempt, error, throwError)
import Data.Either (Either(..))
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
type TrackPlays = { userId :: Nullable String, title :: String, uri :: Nullable String, plays :: Int }

retrieve :: Context -> QueryParams -> Aff (Array Foreign)
retrieve ctx params = do
  result <- attempt do
    let size = fromMaybe 100 (toMaybe params.limit)
        start = fromMaybe 0 (toMaybe params.offset)
    artists :: Array { id :: String, name :: String } <- run ctx.readDb
      (selectFieldsFrom { id: toSQL T.artistsC.id, name: toSQL T.artistsC.name } T.artists # where_ (SQL.eq (toSQL T.artistsC.uri) (SQL.string params.uri)))
    case head artists of
      Nothing -> pure []
      Just artist -> do
        ranked :: Array { userId :: Nullable String, totalArtistPlays :: Int } <- run ctx.readDb
          (selectFieldsFrom { userId: toSQL T.scrobblesC.userId, totalArtistPlays: SQL.countOf (toSQL T.scrobblesC.id) } T.scrobbles
            # where_ (SQL.eq (toSQL T.scrobblesC.artistId) (SQL.string artist.id))
            # groupBy [toSQL T.scrobblesC.userId] # orderBy [SQL.desc (SQL.countOf (toSQL T.scrobblesC.id))]
            # limit size # offset start)
        if null ranked then pure [] else do
          let userIds = map SQL.string (mapMaybe (toMaybe <<< _.userId) ranked)
          data_ <- sequential $ { users: _, tracks: _ }
            <$> parallel (run ctx.readDb (selectFieldsFrom
              { id: toSQL T.usersC.id, avatar: toSQL T.usersC.avatar, did: toSQL T.usersC.did
              , displayName: toSQL T.usersC.displayName, handle: toSQL T.usersC.handle } T.users
              # where_ (SQL.inArray (toSQL T.usersC.id) userIds)) :: Aff (Array Listener))
            <*> parallel (run ctx.readDb (selectFieldsFrom
              { userId: toSQL T.scrobblesC.userId, title: toSQL T.tracksC.title, uri: toSQL T.tracksC.uri, plays: SQL.countOf (toSQL T.scrobblesC.id) } T.scrobbles
              # innerJoin T.tracks (SQL.eq (toSQL T.scrobblesC.trackId) (toSQL T.tracksC.id))
              # where_ (SQL.and (SQL.eq (toSQL T.scrobblesC.artistId) (SQL.string artist.id)) (SQL.inArray (toSQL T.scrobblesC.userId) userIds))
              # groupBy [toSQL T.scrobblesC.userId, toSQL T.tracksC.id, toSQL T.tracksC.title, toSQL T.tracksC.uri]) :: Aff (Array TrackPlays))
          let users = Map.fromFoldable (map (\u -> Tuple u.id u) data_.users)
              tracks = foldl mostPlayed Map.empty data_.tracks
          pure (catMaybes (mapWithIndex (\index item -> do
            id <- toMaybe item.userId
            if id == "" then Nothing else do
              user <- Map.lookup id users
              let track = Map.lookup id tracks
              pure (toForeign
                { id, did: user.did, handle: user.handle, displayName: fromMaybe "" (toMaybe user.displayName), avatar: user.avatar
                , mostListenedSong: { title: fromMaybe "" (_.title <$> track), uri: fromMaybe "" (track >>= toMaybe <<< _.uri), playCount: fromMaybe 0 (_.plays <$> track) }
                , totalPlays: item.totalArtistPlays, rank: start + index + 1 })) ranked))
  case result of
    Right rows -> pure rows
    Left e -> throwError (error ("Failed to retrieve artist's listeners: " <> describeError e))
  where
  mostPlayed acc row = case toMaybe row.userId of
    Just id | id /= "" -> case Map.lookup id acc of
      Just previous | previous.plays >= row.plays -> acc
      _ -> Map.insert id row acc
    _ -> acc

register :: Server -> Context -> Effect Unit
-- The source runs Cache.make anew on each request; no entries survive a call.
register server ctx = Xrpc.method server "app.rocksky.artist.getArtistListeners"
  { auth: Nothing
  , handler: \input -> do
      listeners <- recoverWith [] (timeoutMs 10000 (retryTransientDb (retrieve ctx (Util.params input))))
      pure (Util.json { listeners })
  }
