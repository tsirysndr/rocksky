module Rocksky.Xrpc.App.Rocksky.Artist.GetArtistAlbums (register, retrieve) where

import Prelude
import Atproto.XrpcServer as Xrpc
import Control.Parallel (parallel, sequential)
import Data.Array (head, mapMaybe, null)
import Data.Either (Either(..))
import Data.Map as Map
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Nullable (Nullable, toMaybe)
import Data.Tuple (Tuple(..))
import Drizzle.Builder (groupBy, run, selectFieldsFrom)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (toSQL)
import Effect (Effect)
import Effect.Aff (Aff, attempt, error, throwError)
import Effect.Class (liftEffect)
import Foreign (Foreign)
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Lib.Aff (retryTransientDb, timeoutMs)
import Rocksky.Lib.Error (describeError, logError)
import Rocksky.Lib.Foreign (toForeign)
import Rocksky.Lib.QueryCache (queryCache)
import Rocksky.Schema as T
import Rocksky.Xrpc.Util as Util

type AlbumRow =
  { id :: String, uri :: Nullable String, title :: String, artist :: String, artistUri :: Nullable String
  , year :: Nullable Int, albumArt :: Nullable String, releaseDate :: Nullable String, sha256 :: String }

retrieve :: Context -> String -> Aff (Array Foreign)
retrieve ctx uri = do
  result <- attempt do
    artists :: Array { id :: String } <- run ctx.readDb (selectFieldsFrom { id: toSQL T.artistsC.id } T.artists # where_ (SQL.eq (toSQL T.artistsC.uri) (SQL.string uri)))
    case head artists of
      Nothing -> pure []
      Just artist -> do
        links :: Array { albumId :: Nullable String } <- run ctx.readDb
          (selectFieldsFrom { albumId: toSQL T.artistAlbumsC.albumId } T.artistAlbums # where_ (SQL.eq (toSQL T.artistAlbumsC.artistId) (SQL.string artist.id)))
        let ids = map SQL.string (mapMaybe (toMaybe <<< _.albumId) links)
        if null ids then pure [] else do
          result <- sequential $ { albums: _, counts: _ }
            <$> parallel (run ctx.readDb (selectFieldsFrom
              { id: toSQL T.albumsC.id, uri: toSQL T.albumsC.uri, title: toSQL T.albumsC.title, artist: toSQL T.albumsC.artist
              , artistUri: toSQL T.albumsC.artistUri, year: toSQL T.albumsC.year, albumArt: toSQL T.albumsC.albumArt
              , releaseDate: toSQL T.albumsC.releaseDate, sha256: toSQL T.albumsC.sha256 } T.albums
              # where_ (SQL.inArray (toSQL T.albumsC.id) ids)) :: Aff (Array AlbumRow))
            <*> parallel (run ctx.readDb (selectFieldsFrom
              { albumId: toSQL T.scrobblesC.albumId, play_count: SQL.count, unique_listeners: SQL.countDistinct (toSQL T.scrobblesC.userId) } T.scrobbles
              # where_ (SQL.inArray (toSQL T.scrobblesC.albumId) ids) # groupBy [toSQL T.scrobblesC.albumId]) :: Aff (Array { albumId :: Nullable String, play_count :: Int, unique_listeners :: Int }))
          let counts = Map.fromFoldable (mapMaybe (\r -> (\id -> Tuple id r) <$> toMaybe r.albumId) result.counts)
          pure (map (\album ->
            let c = Map.lookup album.id counts
            in toForeign { id: album.id, uri: album.uri, title: album.title, artist: album.artist, artistUri: album.artistUri
              , year: album.year, albumArt: album.albumArt, releaseDate: album.releaseDate, sha256: album.sha256
              , playCount: fromMaybe 0 (_.play_count <$> c), uniqueListeners: fromMaybe 0 (_.unique_listeners <$> c) }) result.albums)
  case result of
    Right rows -> pure rows
    Left e -> throwError (error ("Failed to retrieve artist's albums: " <> describeError e))

register :: Server -> Context -> Effect Unit
register server ctx = do
  cached <- queryCache (\params -> timeoutMs 10000 (retryTransientDb (retrieve ctx params.uri))) 600000 200
  Xrpc.method server "app.rocksky.artist.getArtistAlbums"
    { auth: Nothing
    , handler: \input -> do
        result <- attempt (cached (Util.params input :: { uri :: String }))
        case result of
          Right albums -> pure (Util.json { albums })
          Left e -> liftEffect (logError e) *> throwError e
    }
