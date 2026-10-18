module Rocksky.Xrpc.App.Rocksky.Artist.GetArtistTracks (register, retrieve, unplayedTracks) where

import Prelude
import Atproto.XrpcServer as Xrpc
import Data.Array (filter, head, length, mapMaybe, null, slice)
import Data.Either (Either(..))
import Data.JSDate as Date
import Data.Map as Map
import Data.Maybe (Maybe(..), fromMaybe, isJust)
import Data.Nullable (Nullable, notNull, toMaybe)
import Data.Traversable (traverse)
import Data.Tuple (Tuple(..))
import Drizzle.Builder (groupBy, innerJoin, limit, offset, orderBy, run, selectFieldsFrom)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (tableSQL, toSQL)
import Effect (Effect)
import Effect.Aff (Aff, attempt, error, throwError)
import Effect.Class (liftEffect)
import Foreign (Foreign)
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Lib.Aff (recoverWith, retryTransientDb, timeoutMs)
import Rocksky.Lib.Credits (creditsArtistRow)
import Rocksky.Lib.Error (describeError)
import Rocksky.Lib.Foreign (toForeign)
import Rocksky.Schema as T
import Rocksky.Schema.Tracks (SelectTrack)
import Rocksky.Xrpc.Util as Util

type QueryParams = { uri :: String, limit :: Nullable Int, offset :: Nullable Int }
type Credit = { trackId :: String, artist :: String, albumArtist :: String }

unplayedTracks :: Context -> { id :: String, name :: String } -> Int -> Int -> Aff (Array Credit)
unplayedTracks ctx artist size start = do
  rows :: Array Credit <- run ctx.readDb
    (selectFieldsFrom { trackId: toSQL T.artistTracksC.trackId, artist: toSQL T.tracksC.artist, albumArtist: toSQL T.tracksC.albumArtist } T.artistTracks
      # innerJoin T.tracks (SQL.eq (toSQL T.tracksC.id) (toSQL T.artistTracksC.trackId))
      # where_ (SQL.and (SQL.eq (toSQL T.artistTracksC.artistId) (SQL.string artist.id))
        (SQL.notExists (SQL.template ["(SELECT 1 FROM ", " WHERE ", " = ", " AND ", " = ", ")"]
          [tableSQL T.scrobbles, toSQL T.scrobblesC.artistId, SQL.string artist.id, toSQL T.scrobblesC.trackId, toSQL T.artistTracksC.trackId])))
      # orderBy [SQL.asc (toSQL T.artistTracksC.trackId)])
  pure (slice start (start + size) (filter (creditsArtistRow (notNull artist.name)) rows))

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
        ranking :: Array { trackId :: Nullable String, play_count :: Int, unique_listeners :: Int } <- run ctx.readDb
          (selectFieldsFrom { trackId: toSQL T.scrobblesC.trackId, play_count: SQL.countOf (toSQL T.scrobblesC.id), unique_listeners: SQL.countDistinct (toSQL T.scrobblesC.userId) } T.scrobbles
            # where_ (SQL.eq (toSQL T.scrobblesC.artistId) (SQL.string artist.id))
            # groupBy [toSQL T.scrobblesC.trackId]
            # orderBy [SQL.desc (SQL.countOf (toSQL T.scrobblesC.id)), SQL.asc (toSQL T.scrobblesC.trackId)]
            # limit size # offset start)
        let ranked = filter (\r -> isJust (toMaybe r.trackId) && toMaybe r.trackId /= Just "") ranking
        unplayed <- if length ranked < size then do
          skipped <- if start == 0 then pure 0 else do
            played :: Array { trackId :: Nullable String } <- run ctx.readDb
              (selectFieldsFrom { trackId: toSQL T.scrobblesC.trackId } T.scrobbles
                # where_ (SQL.eq (toSQL T.scrobblesC.artistId) (SQL.string artist.id))
                # groupBy [toSQL T.scrobblesC.trackId])
            pure (max 0 (start - length played))
          unplayedTracks ctx artist (size - length ranked) skipped
          else pure []
        let ids = mapMaybe (toMaybe <<< _.trackId) ranked <> map _.trackId unplayed
        if null ids then pure [] else do
          tracks :: Array SelectTrack <- run ctx.readDb (selectFieldsFrom
            { id: toSQL T.tracksC.id, title: toSQL T.tracksC.title, artist: toSQL T.tracksC.artist, albumArtist: toSQL T.tracksC.albumArtist
            , albumArt: toSQL T.tracksC.albumArt, album: toSQL T.tracksC.album, uri: toSQL T.tracksC.uri, albumUri: toSQL T.tracksC.albumUri
            , artistUri: toSQL T.tracksC.artistUri, sha256: toSQL T.tracksC.sha256, trackNumber: toSQL T.tracksC.trackNumber
            , discNumber: toSQL T.tracksC.discNumber, duration: toSQL T.tracksC.duration, copyrightMessage: toSQL T.tracksC.copyrightMessage
            , createdAt: toSQL T.tracksC.createdAt } T.tracks # where_ (SQL.inArray (toSQL T.tracksC.id) (map SQL.string ids)))
          let trackMap = Map.fromFoldable (map (\t -> Tuple t.id t) tracks)
              counts = Map.fromFoldable (mapMaybe (\r -> (\id -> Tuple id r) <$> toMaybe r.trackId) ranked)
          liftEffect (traverse (\track -> do
            createdAt <- Date.toISOString track.createdAt
            let c = Map.lookup track.id counts
            pure (toForeign
              { id: track.id, uri: track.uri, title: track.title, artist: track.artist, artistUri: track.artistUri
              , album: track.album, albumUri: track.albumUri, albumArt: track.albumArt, albumArtist: track.albumArtist
              , copyrightMessage: track.copyrightMessage, discNumber: track.discNumber, duration: track.duration
              , sha256: track.sha256, trackNumber: track.trackNumber, playCount: fromMaybe 0 (_.play_count <$> c)
              , uniqueListeners: fromMaybe 0 (_.unique_listeners <$> c), createdAt }))
            (mapMaybe (\id -> Map.lookup id trackMap) ids))
  case result of
    Right rows -> pure rows
    Left e -> throwError (error ("Failed to retrieve artist's tracks: " <> describeError e))

register :: Server -> Context -> Effect Unit
-- The source runs Cache.make anew on each request; no entries survive a call.
register server ctx = Xrpc.method server "app.rocksky.artist.getArtistTracks"
  { auth: Nothing
  , handler: \input -> do
      tracks <- recoverWith [] (timeoutMs 10000 (retryTransientDb (retrieve ctx (Util.params input))))
      pure (Util.json { tracks })
  }
