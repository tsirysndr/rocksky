module Rocksky.Xrpc.App.Rocksky.Charts.Common where

import Prelude
import Control.Alt ((<|>))
import Data.Array as A
import Data.JSDate as Date
import Data.Maybe (Maybe(..), fromMaybe, isJust)
import Data.Nullable (Nullable, toMaybe)
import Data.Number as Number
import Data.Traversable (traverse)
import Drizzle.Builder (run, selectFieldsFrom)
import Drizzle.Database (Database, executeRows)
import Drizzle.Dialect (Postgres)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (toSQL)
import Effect.Aff (Aff)
import Effect.Class (liftEffect)
import Foreign (Foreign)
import Rocksky.Lib.Foreign as F
import Rocksky.Schema as T

type QueryParams = { did :: Nullable String, startDate :: Nullable String, endDate :: Nullable String, limit :: Nullable Int, offset :: Nullable Int }
type Rank = { id :: Nullable String, scrobbles :: Foreign, uniqueListeners :: Foreign }

nonempty :: Nullable String -> Maybe String
nonempty n = toMaybe n >>= \s -> if s == "" then Nothing else Just s

orDefault :: Int -> Nullable Int -> Int
orDefault fallback value = case toMaybe value of
  Just n | n /= 0 -> n
  _ -> fallback

number :: Foreign -> Number
number value = fromMaybe 0.0 (F.asNumber value <|> (F.asString value >>= Number.fromString))

ranking :: Database Postgres -> Boolean -> QueryParams -> Aff (Array Rank)
ranking db artists params = do
  let did = nonempty params.did
  user <- case did of
    Nothing -> pure Nothing
    Just value -> do
      rows :: Array { id :: String } <- run db (selectFieldsFrom { id: toSQL T.usersC.id } T.users
        # where_ (SQL.or (SQL.eq (toSQL T.usersC.did) (SQL.string value)) (SQL.eq (toSQL T.usersC.handle) (SQL.string value))))
      pure (_.id <$> A.head rows)
  if isJust did && not (isJust user) then pure [] else do
    dates <- liftEffect (traverse (\{ op, value } -> do
      date <- Date.parse value
      pure (SQL.template ["s.timestamp ", " ", ""] [SQL.raw op, SQL.date date]))
      (A.catMaybes [ (\value -> { op: ">=", value }) <$> nonempty params.startDate, (\value -> { op: "<=", value }) <$> nonempty params.endDate ]))
    let
      conditions = dates <> A.fromFoldable (map (\id -> SQL.template ["s.user_id = ", ""] [SQL.string id]) user)
      condition = if A.null conditions then SQL.raw "" else SQL.template [" WHERE ", ""] [SQL.join (SQL.raw " AND ") conditions]
      size = SQL.int (orDefault 50 params.limit)
      start = SQL.int (orDefault 0 params.offset)
      materialized = not (isJust did) && A.null dates
      idColumn = if artists then "artist_id" else "track_id"
      counts = SQL.template ["SELECT s.", " AS id, count(*) AS scrobbles, count(DISTINCT s.user_id) AS unique_listeners FROM scrobbles s", " GROUP BY s.", ""] [SQL.raw idColumn, condition, SQL.raw idColumn]
      order = SQL.raw (if isJust did then "c.scrobbles" else "c.unique_listeners")
      live = SQL.template ["SELECT c.id, c.scrobbles, c.unique_listeners AS \"uniqueListeners\" FROM (", ") c", " ORDER BY ", " DESC, c.id LIMIT ", " OFFSET ", ""]
        [ counts, SQL.raw (if artists then " JOIN artists a ON a.xata_id = c.id WHERE a.name != 'Various Artists'" else ""), order, size, start ]
      allTime = if artists then SQL.template
        ["SELECT c.artist_id AS id, c.scrobbles, c.unique_listeners AS \"uniqueListeners\" FROM chart_artists_mv c JOIN artists a ON a.xata_id = c.artist_id WHERE a.name != 'Various Artists' ORDER BY c.unique_listeners DESC, c.artist_id LIMIT ", " OFFSET ", ""] [size, start]
        else SQL.template ["SELECT track_id AS id, scrobbles, unique_listeners AS \"uniqueListeners\" FROM chart_tracks_mv ORDER BY unique_listeners DESC, track_id LIMIT ", " OFFSET ", ""] [size, start]
    map F.unsafeFromForeign <$> executeRows db (if materialized then allTime else live)
