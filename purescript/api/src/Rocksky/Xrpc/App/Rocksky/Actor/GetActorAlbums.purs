-- | app.rocksky.actor.getActorAlbums
module Rocksky.Xrpc.App.Rocksky.Actor.GetActorAlbums (register, QueryParams, Album) where

import Prelude

import Atproto.XrpcServer (HandlerOutput(..))
import Atproto.XrpcServer as Xrpc
import Control.Parallel (parSequence)
import Data.Array (catMaybes, head, mapMaybe)
import Data.Either (Either(..))
import Data.Int (fromString)
import Foreign (Foreign)
import Data.JSDate (JSDate, parse)
import Data.Map as Map
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Nullable (Nullable, toMaybe)
import Data.Tuple (Tuple(..))
import Drizzle.Builder (groupBy, limit, offset, orderBy, run, selectFieldsFrom)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (toSQL)
import Effect (Effect)
import Effect.Aff (Aff)
import Effect.Class (liftEffect)
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Lib.Aff (recoverWith, retryTransientDb, timeoutMs)
import Rocksky.Lib.Foreign (deepCamelCaseKeys, toForeign)
import Rocksky.Lib.QueryCache (queryCache)
import Rocksky.Schema as T
import Rocksky.Xrpc.Util (params)

type QueryParams = { did :: String, limit :: Nullable Int, offset :: Nullable Int, startDate :: Nullable String, endDate :: Nullable String }

type Album =
  { id :: String
  , uri :: Nullable String
  , title :: String
  , artist :: String
  , artist_uri :: Nullable String
  , year :: Nullable Int
  , album_art :: Nullable String
  , release_date :: Nullable String
  , sha256 :: String
  , play_count :: Int
  , unique_listeners :: Int
  }

register :: Server -> Context -> Effect Unit
register server ctx = do
  -- Allocated once per handler: concurrent lookups share one query and
  -- database failures are never retained.
  cached <- queryCache
    (\p -> timeoutMs 120000 $ retryTransientDb $ presentation <$> retrieve ctx p)
    (2 * 60 * 1000)
    200
  Xrpc.method server "app.rocksky.actor.getActorAlbums"
    { auth: Just ctx.authVerifier
    , handler: \input -> do
        result <- recoverWith (toForeign { albums: ([] :: Array Album) }) (cached (params input))
        pure (Json result)
    }

parseDate :: String -> Aff JSDate
parseDate s = liftEffect (parse s)

retrieve :: Context -> QueryParams -> Aff (Array Album)
retrieve ctx p = do
  let
    lim = fromMaybe 10 (toMaybe p.limit)
    off = fromMaybe 0 (toMaybe p.offset)
  users :: Array { id :: String } <- run ctx.readDb
    ( selectFieldsFrom { id: toSQL T.usersC.id } T.users
        # where_ (SQL.or (SQL.eq (toSQL T.usersC.did) (SQL.string p.did)) (SQL.eq (toSQL T.usersC.handle) (SQL.string p.did)))
    )
  case users of
    [] -> pure []
    _ -> do
      let user = fromMaybe { id: "" } (head users)
      start <- traverse' parseDate (toMaybe p.startDate)
      end <- traverse' parseDate (toMaybe p.endDate)
      let
        dateConditions = catMaybes
          [ (\d -> SQL.gte (toSQL T.scrobblesC.timestamp) (SQL.date d)) <$> start
          , (\d -> SQL.lte (toSQL T.scrobblesC.timestamp) (SQL.date d)) <$> end
          ]
        whereAll conds = fromMaybe (SQL.raw "true") (SQL.andAll conds)
      topAlbums :: Array { albumId :: Nullable String, play_count :: Int } <- run ctx.readDb
        ( selectFieldsFrom { albumId: toSQL T.scrobblesC.albumId, play_count: SQL.as "play_count" SQL.count } T.scrobbles
            # where_ (whereAll ([ SQL.eq (toSQL T.scrobblesC.userId) (SQL.string user.id) ] <> dateConditions))
            # groupBy [ toSQL T.scrobblesC.albumId ]
            # orderBy [ SQL.desc (SQL.template [ "count(*)" ] []), toSQL T.scrobblesC.albumId ]
            # limit lim
            # offset off
        )
      case topAlbums of
        [] -> pure []
        _ -> do
          let albumIds = mapMaybe (toMaybe <<< _.albumId) topAlbums
          Tuple albums listeners <- parSequence2
            ( run ctx.readDb
                ( selectFieldsFrom
                    { id: toSQL T.albumsC.id
                    , uri: toSQL T.albumsC.uri
                    , title: toSQL T.albumsC.title
                    , artist: toSQL T.albumsC.artist
                    , artistUri: toSQL T.albumsC.artistUri
                    , year: toSQL T.albumsC.year
                    , albumArt: toSQL T.albumsC.albumArt
                    , releaseDate: toSQL T.albumsC.releaseDate
                    , sha256: toSQL T.albumsC.sha256
                    }
                    T.albums
                    # where_ (SQL.inArray (toSQL T.albumsC.id) (map SQL.string albumIds))
                ) :: Aff (Array AlbumRow)
            )
            ( run ctx.readDb
                ( selectFieldsFrom
                    { albumId: toSQL T.scrobblesC.albumId
                    , unique_listeners: SQL.template [ "count(distinct ", ")" ] [ toSQL T.scrobblesC.userId ]
                    }
                    T.scrobbles
                    # where_ (whereAll ([ SQL.inArray (toSQL T.scrobblesC.albumId) (map SQL.string albumIds) ] <> dateConditions))
                    # groupBy [ toSQL T.scrobblesC.albumId ]
                ) :: Aff (Array { albumId :: Nullable String, unique_listeners :: Nullable String })
            )
          let
            albumMap = Map.fromFoldable (map (\a -> Tuple a.id a) albums)
            listenersMap = Map.fromFoldable (mapMaybe (\r -> (\k -> Tuple k (fromMaybe 0 (toMaybe r.unique_listeners >>= fromString))) <$> toMaybe r.albumId) listeners)
            playCountMap = Map.fromFoldable (mapMaybe (\r -> (\k -> Tuple k r.play_count) <$> toMaybe r.albumId) topAlbums)
          pure $ mapMaybe
            ( \item -> do
                albumId <- toMaybe item.albumId
                album <- Map.lookup albumId albumMap
                pure
                  { id: album.id
                  , uri: album.uri
                  , title: album.title
                  , artist: album.artist
                  , artist_uri: album.artistUri
                  , year: album.year
                  , album_art: album.albumArt
                  , release_date: album.releaseDate
                  , sha256: album.sha256
                  , play_count: fromMaybe 0 (Map.lookup albumId playCountMap)
                  , unique_listeners: fromMaybe 0 (Map.lookup albumId listenersMap)
                  }
            )
            topAlbums
  where
  traverse' f = case _ of
    Nothing -> pure Nothing
    Just x -> Just <$> f x
  parSequence2 a b = do
    rs <- parSequence [ map Left a, map Right b ]
    case rs of
      [ Left x, Right y ] -> pure (Tuple x y)
      _ -> pure (Tuple [] [])

type AlbumRow =
  { id :: String
  , uri :: Nullable String
  , title :: String
  , artist :: String
  , artistUri :: Nullable String
  , year :: Nullable Int
  , albumArt :: Nullable String
  , releaseDate :: Nullable String
  , sha256 :: String
  }

-- | Snake-cased rows become the lexicon's camelCase `AlbumViewBasic`s.
presentation :: Array Album -> Foreign
presentation albums = deepCamelCaseKeys (toForeign { albums })
