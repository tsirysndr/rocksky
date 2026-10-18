module Rocksky.Xrpc.App.Rocksky.Charts.GetTopTracks (register, retrieve) where

import Prelude
import Atproto.XrpcServer as Xrpc
import Data.Array as A
import Data.JSDate as Date
import Data.Map as Map
import Data.Maybe (Maybe(..))
import Data.Nullable (toMaybe)
import Data.Traversable (traverse)
import Data.Tuple (Tuple(..))
import Drizzle.Builder (run, selectFieldsFrom)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (toSQL)
import Effect (Effect)
import Effect.Aff (Aff)
import Effect.Class (liftEffect)
import Foreign (Foreign)
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Lib.Aff (recoverWith, retryTransientDb, timeoutMs)
import Rocksky.Lib.DbQuery (readQuery)
import Rocksky.Lib.Foreign (toForeign)
import Rocksky.Lib.QueryCache (queryCache)
import Rocksky.Schema as T
import Rocksky.Schema.Tracks (SelectTrack)
import Rocksky.Xrpc.App.Rocksky.Charts.Common as Common
import Rocksky.Xrpc.Util as Util

retrieve :: Context -> Common.QueryParams -> Aff (Array Foreign)
retrieve ctx params = readQuery ctx.pools "Failed to retrieve top tracks" \db -> do
  ranked <- Common.ranking db false params
  if A.null ranked then pure [] else do
    let ids = A.mapMaybe (toMaybe <<< _.id) ranked
    tracks :: Array SelectTrack <- run db (selectFieldsFrom
      { id: toSQL T.tracksC.id, title: toSQL T.tracksC.title, artist: toSQL T.tracksC.artist, albumArtist: toSQL T.tracksC.albumArtist
      , albumArt: toSQL T.tracksC.albumArt, uri: toSQL T.tracksC.uri, album: toSQL T.tracksC.album, duration: toSQL T.tracksC.duration
      , trackNumber: toSQL T.tracksC.trackNumber, discNumber: toSQL T.tracksC.discNumber, albumUri: toSQL T.tracksC.albumUri
      , artistUri: toSQL T.tracksC.artistUri, sha256: toSQL T.tracksC.sha256, genre: toSQL T.tracksC.genre, createdAt: toSQL T.tracksC.createdAt } T.tracks
      # where_ (SQL.inArray (toSQL T.tracksC.id) (map SQL.string ids)))
    let byId = Map.fromFoldable (map (\track -> Tuple track.id track) tracks)
    liftEffect (map A.catMaybes (traverse (\rank -> case toMaybe rank.id >>= flip Map.lookup byId of
      Nothing -> pure Nothing
      Just track -> do
        createdAt <- Date.toISOString track.createdAt
        pure (Just (toForeign { id: track.id, title: track.title, artist: track.artist, albumArtist: track.albumArtist, albumArt: track.albumArt
          , uri: track.uri, album: track.album, duration: track.duration, trackNumber: track.trackNumber, discNumber: track.discNumber
          , playCount: Common.number rank.scrobbles, uniqueListeners: Common.number rank.uniqueListeners, albumUri: track.albumUri
          , artistUri: track.artistUri, sha256: track.sha256, tags: A.fromFoldable (Common.nonempty track.genre), createdAt }))) ranked))

register :: Server -> Context -> Effect Unit
register server ctx = do
  cached <- queryCache (timeoutMs 120000 <<< retryTransientDb <<< retrieve ctx) 120000 1000
  Xrpc.method server "app.rocksky.charts.getTopTracks"
    { auth: Nothing, handler: \input -> do
        tracks <- recoverWith [] (cached (Util.params input))
        pure (Util.json { tracks }) }
