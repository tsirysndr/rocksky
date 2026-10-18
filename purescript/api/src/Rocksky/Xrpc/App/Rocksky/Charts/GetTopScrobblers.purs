module Rocksky.Xrpc.App.Rocksky.Charts.GetTopScrobblers (register, retrieve, rangeQuery) where

import Prelude
import Atproto.XrpcServer as Xrpc
import Data.Array as A
import Data.Either (Either(..))
import Data.JSDate as Date
import Data.Maybe (Maybe(..), fromMaybe, isJust)
import Data.Nullable (Nullable)
import Data.Number as Number
import Data.String (Pattern(..), Replacement(..), replaceAll)
import Data.String.CodeUnits as CU
import Drizzle.Database (executeRows)
import Drizzle.SQL as SQL
import Effect (Effect)
import Effect.Aff (Aff, attempt, error, throwError)
import Effect.Class (liftEffect)
import Foreign (Foreign)
import Foreign.Object as Object
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Lib.Aff (recoverWith, retryTransientDb, timeoutMs)
import Rocksky.Lib.Error (describeError)
import Rocksky.Lib.Foreign as F
import Rocksky.Lib.QueryCache (queryCache)
import Rocksky.Xrpc.App.Rocksky.Charts.Common as Common
import Rocksky.Xrpc.Util as Util

type QueryParams = { startDate :: Nullable String, endDate :: Nullable String, limit :: Nullable Int, offset :: Nullable Int }

-- The materialized view covers completed hours only. Its actual maximum,
-- rather than the clock, separates the live tail when refreshes run late.
rangeQuery :: Date.JSDate -> Date.JSDate -> Maybe Date.JSDate -> Int -> Int -> Effect SQL.SQL
rangeQuery start end covered size offset = do
  let
    hour = 3600000.0
    covStart = Date.fromTime (Number.ceil (Date.getTime start / hour) * hour)
    mvEnd = fromMaybe (negate Number.infinity) (Date.getTime <$> covered)
    covEnd = Date.fromTime (max (Date.getTime covStart) (min (Number.floor (Date.getTime end / hour) * hour) mvEnd))
    covers = Date.getTime covEnd > Date.getTime covStart
  startIso <- Date.toISOString start
  endIso <- Date.toISOString end
  covStartIso <- Date.toISOString covStart
  covEndIso <- Date.toISOString covEnd
  let
    utcHour = replaceAll (Pattern "T") (Replacement " ") <<< CU.take 19
    head = if Date.getTime covStart > Date.getTime start then Just (SQL.template
      ["s.timestamp >= ", "::timestamptz AND s.timestamp < ", "::timestamptz AND s.timestamp <= ", "::timestamptz"]
      [SQL.string startIso, SQL.string covStartIso, SQL.string endIso]) else Nothing
    tail = if Date.getTime covEnd <= Date.getTime end then Just (SQL.template
      ["s.timestamp >= ", "::timestamptz AND s.timestamp <= ", "::timestamptz"] [SQL.string covEndIso, SQL.string endIso]) else Nothing
    inView = SQL.template ["m.hour >= ", "::timestamp AND m.hour < ", "::timestamp"] [SQL.string (utcHour covStartIso), SQL.string (utcHour covEndIso)]
    counts = SQL.join (SQL.raw " UNION ALL ") (A.catMaybes
      [ if covers then Just (SQL.template ["SELECT m.user_id, m.scrobbles FROM user_hour_scrobbles_mv m WHERE ", ""] [inView]) else Nothing
      , map (\condition -> SQL.template ["SELECT s.user_id, 1 FROM scrobbles s WHERE ", ""] [condition]) head
      , map (\condition -> SQL.template ["SELECT s.user_id, 1 FROM scrobbles s WHERE ", ""] [condition]) tail ])
    keys = SQL.join (SQL.raw " UNION ALL ") (A.catMaybes
      [ if covers then Just (SQL.template ["SELECT z.artist_key, z.track_key FROM user_hour_scrobbles_mv m CROSS JOIN LATERAL unnest(m.artist_keys, m.track_keys) AS z(artist_key, track_key) WHERE m.user_id = t.id AND ", ""] [inView]) else Nothing
      , map (\condition -> SQL.template ["SELECT hashtext(s.artist_id), hashtext(s.track_id) FROM scrobbles s WHERE s.user_id = t.id AND ", ""] [condition]) head
      , map (\condition -> SQL.template ["SELECT hashtext(s.artist_id), hashtext(s.track_id) FROM scrobbles s WHERE s.user_id = t.id AND ", ""] [condition]) tail ])
  pure (SQL.template
    [ "WITH counts AS (SELECT user_id, sum(scrobbles)::bigint AS scrobbles FROM ("
    , ") legs(user_id, scrobbles) WHERE user_id IS NOT NULL GROUP BY user_id), top AS (SELECT u.xata_id AS id, u.did, u.handle, u.display_name, u.avatar, c.scrobbles FROM counts c JOIN users u ON u.xata_id = c.user_id WHERE u.is_bot = false ORDER BY c.scrobbles DESC, u.xata_id LIMIT "
    , " OFFSET "
    , ") SELECT t.id, t.did, t.handle, t.display_name, t.avatar, t.scrobbles, uq.unique_artists, uq.unique_tracks FROM top t LEFT JOIN LATERAL (SELECT count(DISTINCT k.artist_key)::int AS unique_artists, count(DISTINCT k.track_key)::int AS unique_tracks FROM ("
    , ") k(artist_key, track_key)) uq ON true ORDER BY t.scrobbles DESC, t.id"
    ] [counts, SQL.int size, SQL.int offset, keys])

retrieve :: Context -> QueryParams -> Aff (Array Foreign)
retrieve ctx params = do
  result <- attempt do
    let size = Common.orDefault 20 params.limit
        offset = Common.orDefault 0 params.offset
    statement <- if isJust (Common.nonempty params.startDate) || isJust (Common.nonempty params.endDate) then do
      start <- liftEffect (case Common.nonempty params.startDate of
        Just value -> Date.parse value
        Nothing -> pure (Date.fromTime 0.0))
      end <- liftEffect (case Common.nonempty params.endDate of
        Just value -> Date.parse value
        Nothing -> Date.now)
      coverage <- executeRows ctx.readDb (SQL.raw "SELECT to_char(max(hour) + interval '1 hour', 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') AS through FROM user_hour_scrobbles_mv")
      covered <- case A.head coverage >>= F.readStringAt "through" of
        Just value | value /= "" -> Just <$> liftEffect (Date.parse value)
        _ -> pure Nothing
      liftEffect (rangeQuery start end covered size offset)
      else pure (SQL.template
        ["SELECT u.xata_id AS id, u.did, u.handle, u.display_name, u.avatar, m.scrobbles, m.unique_artists, m.unique_tracks FROM top_scrobblers_mv m JOIN users u ON u.xata_id = m.user_id WHERE u.is_bot = false ORDER BY m.scrobbles DESC, u.xata_id LIMIT ", " OFFSET ", ""] [SQL.int size, SQL.int offset])
    rows <- executeRows ctx.readDb statement
    pure (map (\row -> F.toForeign
      { id: field "id" row, did: field "did" row, handle: field "handle" row, displayName: field "display_name" row, avatar: field "avatar" row
      , scrobbles: Common.number (field "scrobbles" row), uniqueArtists: Common.number (field "unique_artists" row), uniqueTracks: Common.number (field "unique_tracks" row) }) rows)
  case result of
    Left e -> throwError (error ("Failed to retrieve top scrobblers: " <> describeError e))
    Right rows -> pure rows
  where
  field key row = fromMaybe F.undefined (F.asObject row >>= Object.lookup key)

register :: Server -> Context -> Effect Unit
register server ctx = do
  cached <- queryCache (timeoutMs 120000 <<< retryTransientDb <<< retrieve ctx) 600000 1000
  Xrpc.method server "app.rocksky.charts.getTopScrobblers"
    { auth: Nothing, handler: \input -> do
        scrobblers <- recoverWith [] (cached (Util.params input))
        pure (Util.json { scrobblers }) }
