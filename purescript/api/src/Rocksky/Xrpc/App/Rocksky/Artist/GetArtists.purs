module Rocksky.Xrpc.App.Rocksky.Artist.GetArtists (register, retrieveArtists, filterFields) where

import Prelude
import Atproto.XrpcServer as Xrpc
import Control.Parallel (parallel, sequential)
import Data.Array (filter, mapMaybe, null)
import Data.Map as Map
import Data.Maybe (Maybe(..), fromMaybe, maybe)
import Data.Nullable (Nullable, toMaybe)
import Data.String (Pattern(..), split, trim)
import Data.Tuple (Tuple(..))
import Drizzle.Builder (groupBy, limit, offset, orderBy, querySQL, run, selectFieldsFrom)
import Drizzle.Database (Database)
import Drizzle.Dialect (Postgres)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (toSQL)
import Effect (Effect)
import Effect.Aff (Aff)
import Foreign (Foreign)
import Foreign.Object as Object
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Lib.Aff (recoverWith, retryTransientDb, timeoutMs)
import Rocksky.Lib.DbQuery (readQuery)
import Rocksky.Lib.FilteredPage (filteredPage)
import Rocksky.Lib.Foreign (toForeign)
import Rocksky.Lib.QueryCache (queryCache)
import Rocksky.Lib.Rsql (RsqlFieldMap, RsqlFieldType(..), compileRsqlFilterParam, field)
import Rocksky.Schema as T
import Rocksky.Xrpc.Util as Util

type QueryParams = { limit :: Nullable Int, offset :: Nullable Int, names :: Nullable String, genre :: Nullable String, filter :: Nullable String }
type ArtistRow = { id :: String, name :: String, picture :: Nullable String, sha256 :: String, uri :: Nullable String, genres :: Nullable (Array String) }

filterFields :: RsqlFieldMap
filterFields = Object.fromFoldable
  [ Tuple "name" (field (toSQL T.artistsC.name)), Tuple "genres" { column: toSQL T.artistsC.genres, type_: StringArrayField }
  , Tuple "bornIn" (field (toSQL T.artistsC.bornIn)), Tuple "born" { column: toSQL T.artistsC.born, type_: DateField }
  , Tuple "died" { column: toSQL T.artistsC.died, type_: DateField }, Tuple "sha256" (field (toSQL T.artistsC.sha256))
  , Tuple "uri" (field (toSQL T.artistsC.uri)), Tuple "createdAt" { column: toSQL T.artistsC.createdAt, type_: DateField } ]

retrieveArtists :: Database Postgres -> QueryParams -> Aff (Array Foreign)
retrieveArtists db params = do
  let size = fromMaybe 100 (toMaybe params.limit)
      start = fromMaybe 0 (toMaybe params.offset)
      names = filter (_ /= "") (map trim (split (Pattern ",") (fromMaybe "" (toMaybe params.names))))
  rsql <- compileRsqlFilterParam (toMaybe params.filter) filterFields
  let conditions = (if null names then [] else [SQL.inArray (toSQL T.artistsC.name) (map SQL.string names)])
        <> (case toMaybe params.genre of
          Just genre | genre /= "" -> [SQL.template ["", " @> ARRAY[", "]::text[]"] [toSQL T.artistsC.genres, SQL.string genre]]
          _ -> [])
        <> maybe [] pure rsql
  ids <- case SQL.andAll conditions of
    Just condition -> filteredPage db (querySQL db
      (selectFieldsFrom { id: SQL.as "id" (SQL.template ["", ""] [toSQL T.artistsC.id]), created_at: SQL.as "created_at" (SQL.template ["", ""] [toSQL T.artistsC.createdAt]) } T.artists
        # where_ condition)) size start
    Nothing -> do
      top :: Array { artistId :: Nullable String, play_count :: Int } <- run db
        (selectFieldsFrom { artistId: toSQL T.scrobblesC.artistId, play_count: SQL.as "play_count" SQL.count } T.scrobbles
          # groupBy [toSQL T.scrobblesC.artistId]
          # orderBy [SQL.desc (SQL.template ["count(DISTINCT ", ")"] [toSQL T.scrobblesC.userId])]
          # limit size # offset start)
      pure (mapMaybe (toMaybe <<< _.artistId) top)
  if null ids then pure [] else do
    rows <- sequential $ { artists: _, totals: _ }
      <$> parallel (run db (selectFieldsFrom
        { id: toSQL T.artistsC.id, name: toSQL T.artistsC.name, picture: toSQL T.artistsC.picture
        , sha256: toSQL T.artistsC.sha256, uri: toSQL T.artistsC.uri, genres: toSQL T.artistsC.genres } T.artists
        # where_ (SQL.inArray (toSQL T.artistsC.id) (map SQL.string ids))) :: Aff (Array ArtistRow))
      <*> parallel (run db (selectFieldsFrom
        { artistId: toSQL T.scrobblesC.artistId, play_count: SQL.count, unique_listeners: SQL.countDistinct (toSQL T.scrobblesC.userId) } T.scrobbles
        # where_ (SQL.inArray (toSQL T.scrobblesC.artistId) (map SQL.string ids)) # groupBy [toSQL T.scrobblesC.artistId]) :: Aff (Array { artistId :: Nullable String, play_count :: Int, unique_listeners :: Int }))
    let artists = Map.fromFoldable (map (\a -> Tuple a.id a) rows.artists)
        totals = Map.fromFoldable (mapMaybe (\r -> (\id -> Tuple id r) <$> toMaybe r.artistId) rows.totals)
    pure (mapMaybe (\id -> Map.lookup id artists <#> \artist ->
      let total = Map.lookup id totals
      in toForeign { id, name: artist.name, picture: artist.picture, sha256: artist.sha256, uri: artist.uri
        , genres: fromMaybe [] (toMaybe artist.genres), playCount: fromMaybe 0 (_.play_count <$> total), uniqueListeners: fromMaybe 0 (_.unique_listeners <$> total) }) ids)

register :: Server -> Context -> Effect Unit
register server ctx = do
  cached <- queryCache (\params -> timeoutMs 10000 $ retryTransientDb $
    readQuery ctx.pools "Failed to retrieve artists" \db -> retrieveArtists db params) 30000 200
  Xrpc.method server "app.rocksky.artist.getArtists"
    { auth: Nothing
    , handler: \input -> do
        let params = Util.params input :: QueryParams
        void (compileRsqlFilterParam (toMaybe params.filter) filterFields)
        artists <- recoverWith [] (cached params)
        pure (Util.json { artists })
    }
