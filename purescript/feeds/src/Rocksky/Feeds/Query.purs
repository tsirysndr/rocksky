module Rocksky.Feeds.Query where

import Prelude
import Data.Array as Array
import Data.JSDate (JSDate, fromTime, getTime)
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Nullable (Nullable, null, toMaybe)
import Drizzle.Builder as B
import Drizzle.Database (Database, executeRows)
import Drizzle.Dialect (Postgres)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (columns, tableSQL, toSQL)
import Effect.Aff (Aff, throwError)
import Effect.Exception (error)
import Foreign (Foreign)
import Rocksky.Feeds.Algorithms (Algorithm)
import Rocksky.Lib.Foreign as F
import Rocksky.Schema.Artists (artists)
import Rocksky.Schema.Scrobbles (scrobbles)

type Params = { limit :: Int, cursor :: String }

-- JavaScript parseInt preserves the source's millisecond cursor semantics.
foreign import parseCursor :: String -> Nullable Number
foreign import cursorString :: Number -> String

-- Resolve genre artists first, then bound each artist's recent rows before
-- sorting. This preserves the source's indexed, bounded LATERAL query.
genreQuery :: String -> Params -> SQL.SQL
genreQuery genre params = SQL.template
  [ "select newest.uri, (extract(epoch from newest.timestamp) * 1000)::double precision as \"timestampMs\" from "
  , " artist cross join lateral (select recent.uri, recent.timestamp from "
  , " recent where recent.artist_id = artist.xata_id and recent.uri is not null "
  , " order by recent.timestamp desc limit "
  , ") newest where artist.genres @> array["
  , "]::text[] order by newest.timestamp desc limit "
  , ""
  ]
  [ tableSQL artists
  , tableSQL scrobbles
  , case toMaybe (parseCursor params.cursor) of
      Nothing -> SQL.empty
      Just ms -> SQL.template [ "and recent.timestamp < to_timestamp(", "::double precision / 1000)" ] [ SQL.number ms ]
  , SQL.int params.limit
  , SQL.string genre
  , SQL.int params.limit
  ]

response :: Array Foreign -> Foreign
response rows = F.omitNulls $ F.toForeign
  { feed: map (\row -> { scrobble: fromMaybe (F.toForeign null) (F.path "uri" row) }) rows
  , cursor: case Array.last rows >>= F.readNumberAt "timestampMs" of
      Nothing -> F.undefined
      Just ms -> F.toForeign (cursorString ms)
  }

run :: Database Postgres -> Algorithm -> Params -> Aff Foreign
run db algo params = case algo.genre of
  Just genre -> response <$> executeRows db (genreQuery genre params)
  Nothing -> do
    let
      cols = columns scrobbles
      base = B.selectFieldsFrom { uri: toSQL cols.uri, timestamp: toSQL cols.timestamp } scrobbles
    query <-
      if params.cursor == "" then pure base
      else case toMaybe (parseCursor params.cursor) of
        Nothing -> throwError (error "Invalid cursor timestamp")
        Just ms -> do
          let date = fromTime ms
          pure $ base # where_ (SQL.lt (toSQL cols.timestamp) (SQL.date date))
    rows :: Array { uri :: Nullable String, timestamp :: JSDate } <- B.run db
      (query # B.orderBy [ SQL.desc (toSQL cols.timestamp) ] # B.limit params.limit)
    pure $ response $ map (\row -> F.toForeign { uri: row.uri, timestampMs: getTime row.timestamp }) rows
