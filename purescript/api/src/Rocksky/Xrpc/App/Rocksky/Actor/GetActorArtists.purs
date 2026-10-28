-- | app.rocksky.actor.getActorArtists
module Rocksky.Xrpc.App.Rocksky.Actor.GetActorArtists (register, QueryParams, Artist) where

import Prelude

import Atproto.XrpcServer (HandlerOutput(..))
import Atproto.XrpcServer as Xrpc
import Control.Alt ((<|>))
import Control.Monad.Error.Class (catchError, throwError)
import Data.Array (catMaybes)
import Data.Int (fromString)
import Data.JSDate (JSDate, parse)
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Nullable (Nullable, toMaybe)
import Drizzle.Builder (as, groupBy, innerJoin, innerJoinSub, limit, querySQL, offset, orderBy, run, selectFieldsFrom, selectFieldsFromSub, subqueryColumns)
import Drizzle.Query (where_)
import Drizzle.SQL (SQL)
import Drizzle.SQL as SQL
import Drizzle.Schema (toSQL)
import Effect (Effect)
import Effect.Aff (Aff, error)
import Effect.Class (liftEffect)
import Foreign (Foreign)
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Lib.Aff (recoverWith, retryTransientDb, timeoutMs)
import Rocksky.Lib.Error (describeError)
import Rocksky.Lib.Foreign (asInt, asString, deepCamelCaseKeys, toForeign)
import Rocksky.Lib.QueryCache (queryCache)
import Rocksky.Schema as T
import Rocksky.Xrpc.Util (params)

type QueryParams = { did :: String, limit :: Nullable Int, offset :: Nullable Int, startDate :: Nullable String, endDate :: Nullable String }

type Artist =
  { id :: String
  , name :: String
  , picture :: Nullable String
  , play_count :: Int
  , sha256 :: String
  , unique_listeners :: Int
  , uri :: Nullable String
  , tags :: Array String
  }

register :: Server -> Context -> Effect Unit
register server ctx = do
  cached <- queryCache
    (\p -> timeoutMs 120000 $ retryTransientDb $ presentation <$> retrieve ctx p)
    (2 * 60 * 1000)
    200
  Xrpc.method server "app.rocksky.actor.getActorArtists"
    { auth: Nothing
    , handler: \input -> do
        result <- recoverWith (toForeign { artists: ([] :: Array Artist) }) (cached (params input))
        pure (Json result)
    }

retrieve :: Context -> QueryParams -> Aff (Array Artist)
retrieve ctx p = flip catchError (\e -> throwError (error ("Failed to retrieve artists: " <> describeError e))) do
  start <- traverse' parseDate (toMaybe p.startDate)
  end <- traverse' parseDate (toMaybe p.endDate)
  let
    userId = SQL.template [ "(", ")" ]
      [ querySQL ctx.readDb
          ( selectFieldsFrom { id: toSQL T.usersC.id } T.users
              # where_ (SQL.or (SQL.eq (toSQL T.usersC.did) (SQL.string p.did)) (SQL.eq (toSQL T.usersC.handle) (SQL.string p.did)))
              # limit 1
          )
      ]
    dateConditions = catMaybes
      [ (\d -> SQL.gte (toSQL T.scrobblesC.timestamp) (SQL.date d)) <$> start
      , (\d -> SQL.lte (toSQL T.scrobblesC.timestamp) (SQL.date d)) <$> end
      ]
    artistCounts = as ctx.readDb "artist_counts"
      ( selectFieldsFrom { artistId: toSQL T.scrobblesC.artistId, play_count: SQL.as "play_count" SQL.count } T.scrobbles
          # where_ (whereAll ([ SQL.eq (toSQL T.scrobblesC.userId) userId ] <> dateConditions))
          # groupBy [ toSQL T.scrobblesC.artistId ]
      )

    ac :: { artistId :: SQL, play_count :: SQL }
    ac = subqueryColumns artistCounts
    page = as ctx.readDb "top_artists"
      ( selectFieldsFromSub { artistId: ac.artistId, play_count: ac.play_count } artistCounts
          # innerJoin T.artists (SQL.eq ac.artistId (toSQL T.artistsC.id))
          # where_ (SQL.ne (toSQL T.artistsC.name) (SQL.string "Various Artists"))
          # orderBy [ SQL.desc ac.play_count, ac.artistId ]
          # limit (fromMaybe 10 (toMaybe p.limit))
          # offset (fromMaybe 0 (toMaybe p.offset))
      )

    pc :: { artistId :: SQL, play_count :: SQL }
    pc = subqueryColumns page
    listeners = SQL.template [ "(", ")" ]
      [ querySQL ctx.readDb
          ( selectFieldsFrom { count: SQL.template [ "count(distinct ", ")" ] [ toSQL T.scrobblesC.userId ] } T.scrobbles
              # where_ (whereAll ([ SQL.eq (toSQL T.scrobblesC.artistId) (toSQL T.artistsC.id) ] <> dateConditions))
          )
      ]
  rows :: Array { id :: String, name :: String, picture :: Nullable String, sha256 :: String, uri :: Nullable String, genres :: Nullable (Array String), play_count :: Foreign, unique_listeners :: Foreign } <- run ctx.readDb
    ( selectFieldsFrom
        { id: toSQL T.artistsC.id
        , name: toSQL T.artistsC.name
        , picture: toSQL T.artistsC.picture
        , sha256: toSQL T.artistsC.sha256
        , uri: toSQL T.artistsC.uri
        , genres: toSQL T.artistsC.genres
        , play_count: pc.play_count
        , unique_listeners: listeners
        }
        T.artists
        # innerJoinSub page (SQL.eq (toSQL T.artistsC.id) pc.artistId)
        # orderBy [ SQL.desc pc.play_count, toSQL T.artistsC.id ]
    )
  pure
    ( map
        ( \r ->
            { id: r.id
            , name: r.name
            , picture: r.picture
            , sha256: r.sha256
            , uri: r.uri
            , play_count: numberish r.play_count
            , unique_listeners: numberish r.unique_listeners
            , tags: fromMaybe [] (toMaybe r.genres)
            }
        )
        rows
    )
  where
  whereAll conds = fromMaybe (SQL.raw "true") (SQL.andAll conds)
  traverse' f = case _ of
    Nothing -> pure Nothing
    Just x -> Just <$> f x

-- | `Number(x)` for a count that drizzle may hand back as a string.
numberish :: Foreign -> Int
numberish v = fromMaybe 0 (asInt v <|> (asString v >>= fromString))

parseDate :: String -> Aff JSDate
parseDate s = liftEffect (parse s)

presentation :: Array Artist -> Foreign
presentation artists = deepCamelCaseKeys (toForeign { artists })
