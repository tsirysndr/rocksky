module Rocksky.Xrpc.App.Rocksky.Album.GetAlbums (register, retrieveAlbums, filterFields) where

import Prelude
import Atproto.XrpcServer as Xrpc
import Control.Parallel (parallel, sequential)
import Data.Array (mapMaybe, null)
import Data.Map as Map
import Data.Maybe (Maybe(..), fromMaybe, isNothing, maybe)
import Data.Nullable (Nullable, toMaybe)
import Data.Tuple (Tuple(..))
import Drizzle.Builder (groupBy, limit, offset, orderBy, querySQL, run, selectFieldsFrom)
import Drizzle.Database (Database)
import Drizzle.Dialect (Postgres)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (toSQL)
import Effect (Effect)
import Effect.Aff (Aff)
import Foreign.Object as Object
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Lib.Aff (recoverWith, retryTransientDb, timeoutMs)
import Rocksky.Lib.DbQuery (readQuery)
import Rocksky.Lib.FilteredPage (filteredPage)
import Rocksky.Lib.Foreign (deepCamelCaseKeys, toForeign)
import Rocksky.Lib.QueryCache (queryCache)
import Rocksky.Lib.Rsql (RsqlFieldMap, RsqlFieldType(..), compileRsqlFilterParam, field)
import Rocksky.Schema as T
import Rocksky.Xrpc.App.Rocksky.Actor.GetActorAlbums (Album)
import Rocksky.Xrpc.Util as Util

type QueryParams = { limit :: Nullable Int, offset :: Nullable Int, filter :: Nullable String }
type AlbumRow =
  { id :: String, uri :: Nullable String, title :: String, artist :: String, artistUri :: Nullable String
  , year :: Nullable Int, albumArt :: Nullable String, releaseDate :: Nullable String, sha256 :: String }

filterFields :: RsqlFieldMap
filterFields = Object.fromFoldable
  [ Tuple "title" (field (toSQL T.albumsC.title)), Tuple "artist" (field (toSQL T.albumsC.artist))
  , Tuple "year" { column: toSQL T.albumsC.year, type_: NumberField }
  , Tuple "releaseDate" (field (toSQL T.albumsC.releaseDate)), Tuple "sha256" (field (toSQL T.albumsC.sha256))
  , Tuple "uri" (field (toSQL T.albumsC.uri)), Tuple "artistUri" (field (toSQL T.albumsC.artistUri))
  , Tuple "createdAt" { column: toSQL T.albumsC.createdAt, type_: DateField } ]

retrieveAlbums :: Database Postgres -> QueryParams -> Aff { data :: Array Album }
retrieveAlbums db params = do
  let size = fromMaybe 100 (toMaybe params.limit)
      start = fromMaybe 0 (toMaybe params.offset)
  filterWhere <- compileRsqlFilterParam (toMaybe params.filter) filterFields
  pageIds <- case filterWhere of
    Nothing -> pure Nothing
    Just condition -> Just <$> filteredPage db (querySQL db
      (selectFieldsFrom { id: SQL.as "id" (SQL.template ["", ""] [toSQL T.albumsC.id]), created_at: SQL.as "created_at" (SQL.template ["", ""] [toSQL T.albumsC.createdAt]) } T.albums # where_ condition)) size start
  if pageIds == Just [] then pure { data: [] } else do
    topAlbums :: Array { albumId :: Nullable String, play_count :: Int } <- run db
      (selectFieldsFrom { albumId: toSQL T.scrobblesC.albumId, play_count: SQL.as "play_count" SQL.count } T.scrobbles
        # maybe identity (\ids -> where_ (SQL.inArray (toSQL T.scrobblesC.albumId) (map SQL.string ids))) pageIds
        # groupBy [toSQL T.scrobblesC.albumId] # orderBy [SQL.desc (SQL.raw "count(*)")]
        # limit size # offset (if isNothing pageIds then start else 0))
    if isNothing pageIds && null topAlbums then pure { data: [] } else do
      let ids = fromMaybe (mapMaybe (toMaybe <<< _.albumId) topAlbums) pageIds
      rows <- sequential $ { albums: _, listeners: _ }
        <$> parallel (run db (selectFieldsFrom
          { id: toSQL T.albumsC.id, uri: toSQL T.albumsC.uri, title: toSQL T.albumsC.title, artist: toSQL T.albumsC.artist
          , artistUri: toSQL T.albumsC.artistUri, year: toSQL T.albumsC.year, albumArt: toSQL T.albumsC.albumArt
          , releaseDate: toSQL T.albumsC.releaseDate, sha256: toSQL T.albumsC.sha256 } T.albums
          # where_ (SQL.inArray (toSQL T.albumsC.id) (map SQL.string ids))) :: Aff (Array AlbumRow))
        <*> parallel (run db (selectFieldsFrom { albumId: toSQL T.scrobblesC.albumId, unique_listeners: SQL.countDistinct (toSQL T.scrobblesC.userId) } T.scrobbles
          # where_ (SQL.inArray (toSQL T.scrobblesC.albumId) (map SQL.string ids))
          # groupBy [toSQL T.scrobblesC.albumId]) :: Aff (Array { albumId :: Nullable String, unique_listeners :: Int }))
      let albums = Map.fromFoldable (map (\a -> Tuple a.id a) rows.albums)
          listeners = Map.fromFoldable (mapMaybe (\r -> (\id -> Tuple id r.unique_listeners) <$> toMaybe r.albumId) rows.listeners)
          plays = Map.fromFoldable (mapMaybe (\r -> (\id -> Tuple id r.play_count) <$> toMaybe r.albumId) topAlbums)
      pure { data: mapMaybe (\id -> Map.lookup id albums <#> \album ->
        { id: album.id, uri: album.uri, title: album.title, artist: album.artist, artist_uri: album.artistUri
        , year: album.year, album_art: album.albumArt, release_date: album.releaseDate, sha256: album.sha256
        , play_count: fromMaybe 0 (Map.lookup id plays), unique_listeners: fromMaybe 0 (Map.lookup id listeners) }) ids }

register :: Server -> Context -> Effect Unit
register server ctx = do
  cached <- queryCache (\params -> timeoutMs 120000 $ retryTransientDb do
    result <- readQuery ctx.pools "Failed to retrieve albums" \db -> retrieveAlbums db params
    pure (toForeign { albums: deepCamelCaseKeys (toForeign result.data) })) 30000 200
  Xrpc.method server "app.rocksky.album.getAlbums"
    { auth: Nothing
    , handler: \input -> do
        let params = Util.params input :: QueryParams
        void (compileRsqlFilterParam (toMaybe params.filter) filterFields)
        Xrpc.Json <$> recoverWith (toForeign { albums: ([] :: Array Album) }) (cached params)
    }
