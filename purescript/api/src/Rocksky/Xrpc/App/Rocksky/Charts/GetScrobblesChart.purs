-- | app.rocksky.charts.getScrobblesChart
module Rocksky.Xrpc.App.Rocksky.Charts.GetScrobblesChart (register, QueryParams) where

import Prelude

import Atproto.XrpcServer (HandlerOutput(..))
import Atproto.XrpcServer as Xrpc
import Data.Array (head)
import Data.JSDate (getDate, getFullYear, getHours, getMilliseconds, getMinutes, getMonth, getSeconds, jsdateLocal, now, toISOString)
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Nullable (Nullable, toMaybe)
import Data.Number as Number
import Data.String (Pattern(..), contains)
import Data.String (null) as String
import Data.String.CodeUnits (take)
import Drizzle.Builder (groupBy, innerJoin, orderBy, run, selectFieldsFrom)
import Drizzle.Database (Database, executeRows)
import Drizzle.Dialect (Postgres)
import Drizzle.Query (where_)
import Drizzle.SQL (SQL)
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
import Rocksky.Lib.Foreign (asNumber, asString, path, toForeign)
import Rocksky.Lib.QueryCache (queryCache)
import Rocksky.Schema as T
import Rocksky.Xrpc.Util (params)

type QueryParams =
  { did :: Nullable String
  , artisturi :: Nullable String
  , albumuri :: Nullable String
  , songuri :: Nullable String
  , genre :: Nullable String
  , from :: Nullable String
  , to :: Nullable String
  }

-- | `date` is passed through as pg returned it (a `DATE(...)` value or text).
type Row = { date :: Foreign, count :: Number }

register :: Server -> Context -> Effect Unit
register server ctx = do
  cached <- queryCache
    (\p -> timeoutMs 120000 $ retryTransientDb $ presentation <$> retrieve ctx p)
    (30 * 1000)
    200
  Xrpc.method server "app.rocksky.charts.getScrobblesChart"
    { auth: Nothing
    , handler: \input -> do
        result <- recoverWith (toForeign { scrobbles: ([] :: Array Row) }) (cached (params input))
        pure (Json result)
    }

truthy :: Nullable String -> Maybe String
truthy n = case toMaybe n of
  Just s | not (String.null s) -> Just s
  _ -> Nothing

-- | `Number(x)` for the numeric/bigint columns pg hands back as strings.
num :: Foreign -> Number
num f = case asNumber f of
  Just n -> n
  Nothing -> fromMaybe 0.0 (asString f >>= Number.fromString)

defaultDateRange :: QueryParams -> Effect { from :: String, to :: String }
defaultDateRange p = do
  to <- case toMaybe p.to of
    Just t -> pure t
    Nothing -> take 10 <$> (now >>= toISOString)
  from <- case toMaybe p.from of
    Just f -> pure f
    Nothing -> do
      -- d.setMonth(d.getMonth() - 6): the Date constructor normalises the
      -- month overflow the same way.
      d <- now
      year <- getFullYear d
      month <- getMonth d
      day <- getDate d
      hour <- getHours d
      minute <- getMinutes d
      second <- getSeconds d
      millisecond <- getMilliseconds d
      shifted <- jsdateLocal { year, month: month - 6.0, day, hour, minute, second, millisecond }
      take 10 <$> toISOString shifted
  pure { from, to }

inRange :: String -> String -> SQL
inRange from to = SQL.template
  [ "", " >= ", "::date AND ", " < ", "::date + INTERVAL '1 day'" ]
  [ toSQL T.scrobblesC.timestamp, SQL.string from, toSQL T.scrobblesC.timestamp, SQL.string to ]

day :: SQL
day = SQL.template [ "DATE(", ")" ] [ toSQL T.scrobblesC.timestamp ]

scrobblesPerDay :: Database Postgres -> SQL -> String -> String -> Aff (Array Row)
scrobblesPerDay db condition from to = run db
  ( selectFieldsFrom { date: day, count: SQL.count } T.scrobbles
      # where_ (SQL.and condition (inRange from to))
      # groupBy [ day ]
      # orderBy [ day ]
  )

firstId :: forall r. Aff (Array { id :: String | r }) -> Aff (Maybe String)
firstId q = map _.id <<< head <$> q

retrieve :: Context -> QueryParams -> Aff (Array Row)
retrieve ctx p = readQuery ctx.pools "Failed to retrieve scrobbles chart" \db -> do
  { from, to } <- liftEffect (defaultDateRange p)
  let
    byId :: Maybe String -> (String -> SQL) -> Aff (Array Row)
    byId mid cond = case mid of
      Nothing -> pure []
      Just id -> scrobblesPerDay db (cond id) from to
  case truthy p.did, truthy p.artisturi, truthy p.albumuri, truthy p.songuri, truthy p.genre of
    Just did, _, _, _, _ -> do
      user <- firstId (run db (selectFieldsFrom { id: toSQL T.usersC.id } T.users # where_ (SQL.or (SQL.eq (toSQL T.usersC.did) (SQL.string did)) (SQL.eq (toSQL T.usersC.handle) (SQL.string did)))))
      byId user (SQL.eq (toSQL T.scrobblesC.userId) <<< SQL.string)
    _, Just uri, _, _, _ -> do
      artist <- firstId (run db (selectFieldsFrom { id: toSQL T.artistsC.id } T.artists # where_ (SQL.eq (toSQL T.artistsC.uri) (SQL.string uri))))
      byId artist (SQL.eq (toSQL T.scrobblesC.artistId) <<< SQL.string)
    _, _, Just uri, _, _ -> do
      album <- firstId (run db (selectFieldsFrom { id: toSQL T.albumsC.id } T.albums # where_ (SQL.eq (toSQL T.albumsC.uri) (SQL.string uri))))
      byId album (SQL.eq (toSQL T.scrobblesC.albumId) <<< SQL.string)
    _, _, _, Just uri, _ -> do
      trackId <-
        if contains (Pattern "app.rocksky.scrobble") uri then do
          rows :: Array { trackId :: Nullable String } <- run db (selectFieldsFrom { trackId: toSQL T.scrobblesC.trackId } T.scrobbles # where_ (SQL.eq (toSQL T.scrobblesC.uri) (SQL.string uri)))
          pure (head rows >>= toMaybe <<< _.trackId)
        else firstId (run db (selectFieldsFrom { id: toSQL T.tracksC.id } T.tracks # where_ (SQL.eq (toSQL T.tracksC.uri) (SQL.string uri))))
      byId (trackId >>= \t -> if String.null t then Nothing else Just t) (SQL.eq (toSQL T.scrobblesC.trackId) <<< SQL.string)
    _, _, _, _, Just genre ->
      run db
        ( selectFieldsFrom { date: day, count: SQL.count } T.scrobbles
            # innerJoin T.tracks (SQL.eq (toSQL T.scrobblesC.trackId) (toSQL T.tracksC.id))
            # where_ (SQL.and (SQL.eq (toSQL T.tracksC.genre) (SQL.string genre)) (inRange from to))
            # groupBy [ day ]
            # orderBy [ day ]
        )
    _, _, _, _, _ -> globalScrobblesPerDay db from to

-- | Global (unfiltered) series, served from scrobbles_per_day_mv.
-- |
-- | The view holds completed days only, so the second leg covers whatever it has
-- | not caught up on — normally just today, and more if a refresh was missed.
-- | Reading max(day) rather than assuming CURRENT_DATE is what keeps the two
-- | legs from overlapping (double-counting a day) or leaving a gap (dropping
-- | one) when the refresh is late.
globalScrobblesPerDay :: Database Postgres -> String -> String -> Aff (Array Row)
globalScrobblesPerDay db from to = do
  rows <- executeRows db $ SQL.template
    [ """
    SELECT day::text AS date, count
    FROM scrobbles_per_day_mv
    WHERE day BETWEEN """
    , "::date AND "
    , """::date

    UNION ALL

    SELECT (s.timestamp)::date::text AS date, count(*)::bigint AS count
    FROM scrobbles s
    WHERE s.timestamp >= COALESCE(
            (SELECT max(day) + 1 FROM scrobbles_per_day_mv)::timestamp,
            '-infinity'::timestamp)
      AND (s.timestamp)::date BETWEEN """
    , "::date AND "
    , """::date
    GROUP BY (s.timestamp)::date

    ORDER BY 1
  """
    ]
    [ SQL.string from, SQL.string to, SQL.string from, SQL.string to ]
  pure $ map (\r -> { date: fromMaybe (toForeign "") (path "date" r), count: maybe0 (path "count" r) }) rows
  where
  maybe0 = maybe 0.0 num
  maybe d f = case _ of
    Just x -> f x
    Nothing -> d

presentation :: Array Row -> Foreign
presentation rows = toForeign { scrobbles: map (\r -> { date: r.date, count: r.count }) rows }
