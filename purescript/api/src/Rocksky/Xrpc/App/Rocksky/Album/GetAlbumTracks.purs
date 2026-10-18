module Rocksky.Xrpc.App.Rocksky.Album.GetAlbumTracks (register, presentTrack, retrieveTracks) where

import Prelude
import Atproto.XrpcServer as Xrpc
import Data.JSDate (JSDate, toISOString)
import Data.Maybe (Maybe(..))
import Data.Traversable (traverse)
import Drizzle.Builder (leftJoin, orderBy, run, selectFieldsFrom)
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
import Rocksky.Lib.Common (dedupeTracksKeepLyrics)
import Rocksky.Lib.DbQuery (readQuery)
import Rocksky.Lib.Foreign (deleteKeys, mergeForeign, toForeign)
import Rocksky.Schema as T
import Rocksky.Schema.Tracks (SelectTrack)
import Rocksky.Xrpc.Util as Util

presentTrack :: forall r. { createdAt :: JSDate, updatedAt :: JSDate | r } -> Effect Foreign
presentTrack track = do
  createdAt <- toISOString track.createdAt
  updatedAt <- toISOString track.updatedAt
  pure (mergeForeign (deleteKeys ["lyrics"] (toForeign track)) (toForeign { createdAt, updatedAt }))

retrieveTracks :: Database Postgres -> String -> Aff (Array Foreign)
retrieveTracks db uri = do
  rows :: Array { tracks :: SelectTrack } <- run db
    (selectFieldsFrom { tracks: tableSQL T.tracks } T.albumTracks
      # leftJoin T.tracks (SQL.eq (toSQL T.albumTracksC.trackId) (toSQL T.tracksC.id))
      # leftJoin T.albums (SQL.eq (toSQL T.albumTracksC.albumId) (toSQL T.albumsC.id))
      # leftJoin T.userAlbums (SQL.eq (toSQL T.albumsC.id) (toSQL T.userAlbumsC.albumId))
      # where_ (SQL.eq (toSQL T.userAlbumsC.uri) (SQL.string uri))
      # orderBy [SQL.asc (toSQL T.tracksC.discNumber), SQL.asc (toSQL T.tracksC.trackNumber)])
  liftEffect (traverse presentTrack (dedupeTracksKeepLyrics (map _.tracks rows)))

register :: Server -> Context -> Effect Unit
register server ctx = Xrpc.method server "app.rocksky.album.getAlbumTracks"
  { auth: Nothing
  , handler: \input -> do
      let params = Util.params input :: { uri :: String }
      result <- recoverWith (toForeign {}) $ timeoutMs 120000 $ retryTransientDb do
        tracks <- readQuery ctx.pools "Failed to retrieve album tracks" \db -> retrieveTracks db params.uri
        pure (toForeign { tracks })
      pure (Xrpc.Json result)
  }
