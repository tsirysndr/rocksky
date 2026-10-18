-- | app.rocksky.actor.getActorArtists
module Rocksky.Xrpc.App.Rocksky.Actor.GetActorArtists (register, QueryParams, Artist) where

import Prelude

import Atproto.XrpcServer (HandlerOutput(..))
import Atproto.XrpcServer as Xrpc
import Control.Alt ((<|>))
import Control.Monad.Error.Class (catchError, throwError)
import Control.Parallel (parSequence)
import Data.Array (catMaybes, head, mapMaybe)
import Data.Either (Either(..))
import Data.Int (fromString)
import Data.JSDate (JSDate, parse)
import Data.Map as Map
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Nullable (Nullable, toMaybe)
import Data.Tuple (Tuple(..))
import Drizzle.Builder (as, groupBy, innerJoin, limit, offset, orderBy, run, selectFieldsFrom, selectFieldsFromSub, subqueryColumns)
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
  let
    lim = fromMaybe 10 (toMaybe p.limit)
    off = fromMaybe 0 (toMaybe p.offset)
  users :: Array { id :: String } <- run ctx.readDb
    ( selectFieldsFrom { id: toSQL T.usersC.id } T.users
        # where_ (SQL.or (SQL.eq (toSQL T.usersC.did) (SQL.string p.did)) (SQL.eq (toSQL T.usersC.handle) (SQL.string p.did)))
    )
  case head users of
    Nothing -> pure []
    Just user -> do
      start <- traverse' parseDate (toMaybe p.startDate)
      end <- traverse' parseDate (toMaybe p.endDate)
      let
        dateConditions = catMaybes
          [ (\d -> SQL.gte (toSQL T.scrobblesC.timestamp) (SQL.date d)) <$> start
          , (\d -> SQL.lte (toSQL T.scrobblesC.timestamp) (SQL.date d)) <$> end
          ]
        -- Count from the covering index before joining artist metadata.
        artistCounts = as ctx.readDb "artist_counts"
          ( selectFieldsFrom { artistId: toSQL T.scrobblesC.artistId, play_count: SQL.as "play_count" SQL.count } T.scrobbles
              # where_ (whereAll ([ SQL.eq (toSQL T.scrobblesC.userId) (SQL.string user.id) ] <> dateConditions))
              # groupBy [ toSQL T.scrobblesC.artistId ]
          )
        ac :: { artistId :: SQL, play_count :: SQL }
        ac = subqueryColumns artistCounts
      topArtists :: Array { artistId :: Nullable String, play_count :: Foreign } <- run ctx.readDb
        ( selectFieldsFromSub { artistId: ac.artistId, play_count: ac.play_count } artistCounts
            # innerJoin T.artists (SQL.eq ac.artistId (toSQL T.artistsC.id))
            # where_ (SQL.ne (toSQL T.artistsC.name) (SQL.string "Various Artists"))
            # orderBy [ SQL.desc ac.play_count, ac.artistId ]
            # limit lim
            # offset off
        )
      case topArtists of
        [] -> pure []
        _ -> do
          let artistIds = mapMaybe (toMaybe <<< _.artistId) topArtists
          Tuple artists listeners <- parSequence2
            ( run ctx.readDb
                ( selectFieldsFrom
                    { id: toSQL T.artistsC.id
                    , name: toSQL T.artistsC.name
                    , picture: toSQL T.artistsC.picture
                    , sha256: toSQL T.artistsC.sha256
                    , uri: toSQL T.artistsC.uri
                    , genres: toSQL T.artistsC.genres
                    }
                    T.artists
                    # where_ (SQL.inArray (toSQL T.artistsC.id) (map SQL.string artistIds))
                ) :: Aff (Array ArtistRow)
            )
            ( run ctx.readDb
                ( selectFieldsFrom
                    { artistId: toSQL T.scrobblesC.artistId
                    , unique_listeners: SQL.template [ "count(distinct ", ")" ] [ toSQL T.scrobblesC.userId ]
                    }
                    T.scrobbles
                    # where_ (whereAll ([ SQL.inArray (toSQL T.scrobblesC.artistId) (map SQL.string artistIds) ] <> dateConditions))
                    # groupBy [ toSQL T.scrobblesC.artistId ]
                ) :: Aff (Array { artistId :: Nullable String, unique_listeners :: Nullable String })
            )
          let
            artistMap = Map.fromFoldable (map (\a -> Tuple a.id a) artists)
            listenersMap = Map.fromFoldable (mapMaybe (\r -> (\k -> Tuple k (fromMaybe 0 (toMaybe r.unique_listeners >>= fromString))) <$> toMaybe r.artistId) listeners)
            playCountMap = Map.fromFoldable (mapMaybe (\r -> (\k -> Tuple k (numberish r.play_count)) <$> toMaybe r.artistId) topArtists)
          pure $ mapMaybe
            ( \item -> do
                artistId <- toMaybe item.artistId
                artist <- Map.lookup artistId artistMap
                pure
                  { id: artist.id
                  , name: artist.name
                  , picture: artist.picture
                  , sha256: artist.sha256
                  , uri: artist.uri
                  , play_count: fromMaybe 0 (Map.lookup artistId playCountMap)
                  , unique_listeners: fromMaybe 0 (Map.lookup artistId listenersMap)
                  , tags: fromMaybe [] (toMaybe artist.genres)
                  }
            )
            topArtists
  where
  whereAll conds = fromMaybe (SQL.raw "true") (SQL.andAll conds)
  traverse' f = case _ of
    Nothing -> pure Nothing
    Just x -> Just <$> f x
  parSequence2 a b = do
    rs <- parSequence [ map Left a, map Right b ]
    case rs of
      [ Left x, Right y ] -> pure (Tuple x y)
      _ -> pure (Tuple [] [])

-- | `Number(x)` for a count that drizzle may hand back as a string.
numberish :: Foreign -> Int
numberish v = fromMaybe 0 (asInt v <|> (asString v >>= fromString))

parseDate :: String -> Aff JSDate
parseDate s = liftEffect (parse s)

type ArtistRow =
  { id :: String
  , name :: String
  , picture :: Nullable String
  , sha256 :: String
  , uri :: Nullable String
  , genres :: Nullable (Array String)
  }

presentation :: Array Artist -> Foreign
presentation artists = deepCamelCaseKeys (toForeign { artists })
