-- | app.rocksky.charts.getDecades
module Rocksky.Xrpc.App.Rocksky.Charts.GetDecades (register, QueryParams, Decade) where

import Prelude

import Atproto.XrpcServer (HandlerOutput(..))
import Atproto.XrpcServer as Xrpc
import Data.Array (head)
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Nullable (Nullable, toMaybe)
import Data.Number as Number
import Data.String (null) as String
import Data.Traversable (traverse)
import Drizzle.Builder (groupBy, innerJoin, orderBy, run, selectFieldsFrom)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (toSQL)
import Effect (Effect)
import Effect.Aff (Aff)
import Effect.Class (liftEffect)
import Data.JSDate (parse)
import Foreign (Foreign)
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Lib.Aff (recoverWith, retryTransientDb, timeoutMs)
import Rocksky.Lib.DbQuery (readQuery)
import Rocksky.Lib.Foreign (asNumber, asString, toForeign)
import Rocksky.Lib.QueryCache (queryCache)
import Rocksky.Schema as T
import Rocksky.Xrpc.Util (params)

type QueryParams = { did :: Nullable String, startDate :: Nullable String, endDate :: Nullable String }

type Decade = { decade :: Number, scrobbles :: Number, uniqueAlbums :: Number }

-- Anything outside this is a bad tag rather than a real release date, and one
-- stray row would otherwise stretch the axis across centuries.
firstYear :: Int
firstYear = 1900

register :: Server -> Context -> Effect Unit
register server ctx = do
  cached <- queryCache
    (\p -> timeoutMs 120000 $ retryTransientDb $ presentation <$> retrieve ctx p)
    (2 * 60 * 1000)
    200
  Xrpc.method server "app.rocksky.charts.getDecades"
    { auth: Nothing
    , handler: \input -> do
        result <- recoverWith (toForeign { decades: ([] :: Array Decade) }) (cached (params input))
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

retrieve :: Context -> QueryParams -> Aff (Array Decade)
retrieve ctx p = readQuery ctx.pools "Failed to retrieve decades" \db -> do
  start <- traverse (liftEffect <<< parse) (truthy p.startDate)
  end <- traverse (liftEffect <<< parse) (truthy p.endDate)
  let
    baseConditions =
      [ SQL.isNotNull (toSQL T.albumsC.year)
      , SQL.gte (toSQL T.albumsC.year) (SQL.int firstYear)
      , SQL.lte (toSQL T.albumsC.year) (SQL.raw "EXTRACT(YEAR FROM CURRENT_DATE)::int")
      ]
        <> (case start of
          Just d -> [ SQL.gte (toSQL T.scrobblesC.timestamp) (SQL.date d) ]
          Nothing -> [])
        <> (case end of
          Just d -> [ SQL.lte (toSQL T.scrobblesC.timestamp) (SQL.date d) ]
          Nothing -> [])
  userCondition <- case truthy p.did of
    Nothing -> pure (Just [])
    Just did -> do
      users :: Array { id :: String } <- run db
        ( selectFieldsFrom { id: toSQL T.usersC.id } T.users
            # where_ (SQL.or (SQL.eq (toSQL T.usersC.did) (SQL.string did)) (SQL.eq (toSQL T.usersC.handle) (SQL.string did)))
        )
      pure $ (\u -> [ SQL.eq (toSQL T.scrobblesC.userId) (SQL.string u.id) ]) <$> head users
  case userCondition of
    Nothing -> pure []
    Just userConds -> do
      let decade = SQL.template [ "(", " / 10) * 10" ] [ toSQL T.albumsC.year ]
      rows :: Array { decade :: Foreign, scrobbles :: Foreign, uniqueAlbums :: Foreign } <- run db
        ( selectFieldsFrom
            { decade: SQL.as "decade" decade
            , scrobbles: SQL.as "scrobbles" SQL.count
            , uniqueAlbums: SQL.as "unique_albums" (SQL.template [ "count(DISTINCT ", ")" ] [ toSQL T.scrobblesC.albumId ])
            }
            T.scrobbles
            # innerJoin T.albums (SQL.eq (toSQL T.scrobblesC.albumId) (toSQL T.albumsC.id))
            # where_ (fromMaybe (SQL.raw "true") (SQL.andAll (baseConditions <> userConds)))
            # groupBy [ decade ]
            # orderBy [ decade ]
        )
      pure $ map (\r -> { decade: num r.decade, scrobbles: num r.scrobbles, uniqueAlbums: num r.uniqueAlbums }) rows

presentation :: Array Decade -> Foreign
presentation decades = toForeign { decades }
