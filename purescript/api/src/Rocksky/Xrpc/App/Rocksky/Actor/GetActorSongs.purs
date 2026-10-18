-- | app.rocksky.actor.getActorSongs
module Rocksky.Xrpc.App.Rocksky.Actor.GetActorSongs (register, QueryParams, Track, presentation) where

import Prelude

import Atproto.XrpcServer (HandlerOutput(..))
import Atproto.XrpcServer as Xrpc
import Control.Parallel (parSequence)
import Data.Array (catMaybes, head, mapMaybe)
import Data.Either (Either(..))
import Data.Int (fromString)
import Data.JSDate (JSDate, parse, toISOString)
import Data.Map as Map
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Nullable (Nullable, toMaybe)
import Data.String (Pattern(..), stripSuffix)
import Data.Traversable (traverse)
import Data.Tuple (Tuple(..))
import Drizzle.Builder (groupBy, limit, offset, orderBy, run, selectFieldsFrom)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (toSQL)
import Effect (Effect)
import Effect.Aff (Aff)
import Effect.Class (liftEffect)
import Foreign (Foreign)
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Lib.Aff (recoverWith, retryTransientDb, timeoutMs)
import Rocksky.Lib.Foreign (asArray, deepCamelCaseKeys, mergeForeign, readStringAt, toForeign)
import Rocksky.Lib.QueryCache (queryCache)
import Rocksky.Schema as T
import Rocksky.Xrpc.Util (params)

type QueryParams = { did :: String, limit :: Nullable Int, offset :: Nullable Int, startDate :: Nullable String, endDate :: Nullable String }

type Track =
  { id :: String
  , uri :: Nullable String
  , title :: String
  , artist :: String
  , artist_uri :: Nullable String
  , album :: String
  , album_uri :: Nullable String
  , album_art :: Nullable String
  , album_artist :: String
  , copyright_message :: Nullable String
  , disc_number :: Nullable Int
  , duration :: Int
  , sha256 :: String
  , track_number :: Nullable Int
  , play_count :: Int
  , unique_listeners :: Int
  , created_at :: String
  }

type TrackRow =
  { id :: String
  , title :: String
  , artist :: String
  , albumArtist :: String
  , albumArt :: Nullable String
  , album :: String
  , uri :: Nullable String
  , albumUri :: Nullable String
  , artistUri :: Nullable String
  , sha256 :: String
  , trackNumber :: Nullable Int
  , discNumber :: Nullable Int
  , duration :: Int
  , copyrightMessage :: Nullable String
  , createdAt :: JSDate
  }

register :: Server -> Context -> Effect Unit
register server ctx = do
  cached <- queryCache
    (\p -> timeoutMs 120000 $ retryTransientDb $ presentation <$> retrieve ctx p)
    (2 * 60 * 1000)
    200
  Xrpc.method server "app.rocksky.actor.getActorSongs"
    { auth: Nothing
    , handler: \input -> do
        result <- recoverWith (toForeign { tracks: ([] :: Array Foreign) }) (cached (params input))
        pure (Json result)
    }

retrieve :: Context -> QueryParams -> Aff (Array Track)
retrieve ctx p = do
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
      start <- traverse (liftEffect <<< parse) (toMaybe p.startDate)
      end <- traverse (liftEffect <<< parse) (toMaybe p.endDate)
      let
        dateConditions = catMaybes
          [ (\d -> SQL.gte (toSQL T.scrobblesC.timestamp) (SQL.date d)) <$> start
          , (\d -> SQL.lte (toSQL T.scrobblesC.timestamp) (SQL.date d)) <$> end
          ]
        whereAll conds = fromMaybe (SQL.raw "true") (SQL.andAll conds)
      topTracks :: Array { trackId :: Nullable String, play_count :: Int } <- run ctx.readDb
        ( selectFieldsFrom { trackId: toSQL T.scrobblesC.trackId, play_count: SQL.as "play_count" SQL.count } T.scrobbles
            # where_ (whereAll ([ SQL.eq (toSQL T.scrobblesC.userId) (SQL.string user.id) ] <> dateConditions))
            # groupBy [ toSQL T.scrobblesC.trackId ]
            # orderBy [ SQL.desc (SQL.template [ "count(*)" ] []), toSQL T.scrobblesC.trackId ]
            # limit lim
            # offset off
        )
      case topTracks of
        [] -> pure []
        _ -> do
          let trackIds = mapMaybe (toMaybe <<< _.trackId) topTracks
          rs <- parSequence
            [ Left <$>
                ( run ctx.readDb
                    ( selectFieldsFrom
                        { id: toSQL T.tracksC.id
                        , title: toSQL T.tracksC.title
                        , artist: toSQL T.tracksC.artist
                        , albumArtist: toSQL T.tracksC.albumArtist
                        , albumArt: toSQL T.tracksC.albumArt
                        , album: toSQL T.tracksC.album
                        , uri: toSQL T.tracksC.uri
                        , albumUri: toSQL T.tracksC.albumUri
                        , artistUri: toSQL T.tracksC.artistUri
                        , sha256: toSQL T.tracksC.sha256
                        , trackNumber: toSQL T.tracksC.trackNumber
                        , discNumber: toSQL T.tracksC.discNumber
                        , duration: toSQL T.tracksC.duration
                        , copyrightMessage: toSQL T.tracksC.copyrightMessage
                        , createdAt: toSQL T.tracksC.createdAt
                        }
                        T.tracks
                        # where_ (SQL.inArray (toSQL T.tracksC.id) (map SQL.string trackIds))
                    ) :: Aff (Array TrackRow)
                )
            , Right <$>
                ( run ctx.readDb
                    ( selectFieldsFrom
                        { trackId: toSQL T.scrobblesC.trackId
                        , unique_listeners: SQL.template [ "count(distinct ", ")" ] [ toSQL T.scrobblesC.userId ]
                        }
                        T.scrobbles
                        # where_ (whereAll ([ SQL.inArray (toSQL T.scrobblesC.trackId) (map SQL.string trackIds) ] <> dateConditions))
                        # groupBy [ toSQL T.scrobblesC.trackId ]
                    ) :: Aff (Array { trackId :: Nullable String, unique_listeners :: Nullable String })
                )
            ]
          let
            Tuple tracks listeners = case rs of
              [ Left x, Right y ] -> Tuple x y
              _ -> Tuple [] []
            trackMap = Map.fromFoldable (map (\t -> Tuple t.id t) tracks)
            listenersMap = Map.fromFoldable (mapMaybe (\r -> (\k -> Tuple k (fromMaybe 0 (toMaybe r.unique_listeners >>= fromString))) <$> toMaybe r.trackId) listeners)
            playCountMap = Map.fromFoldable (mapMaybe (\r -> (\k -> Tuple k r.play_count) <$> toMaybe r.trackId) topTracks)
            found = mapMaybe (\item -> toMaybe item.trackId >>= \tid -> Tuple tid <$> Map.lookup tid trackMap) topTracks
          liftEffect $ found # traverse \(Tuple trackId track) -> do
            iso <- toISOString track.createdAt
            pure
              { id: track.id
              , uri: track.uri
              , title: track.title
              , artist: track.artist
              , artist_uri: track.artistUri
              , album: track.album
              , album_uri: track.albumUri
              , album_art: track.albumArt
              , album_artist: track.albumArtist
              , copyright_message: track.copyrightMessage
              , disc_number: track.discNumber
              , duration: track.duration
              , sha256: track.sha256
              , track_number: track.trackNumber
              , play_count: fromMaybe 0 (Map.lookup trackId playCountMap)
              , unique_listeners: fromMaybe 0 (Map.lookup trackId listenersMap)
              , created_at: fromMaybe iso (stripSuffix (Pattern "Z") iso)
              }

-- | Snake-cased rows become the lexicon's camelCase `SongViewBasic`s, with the
-- | `Z` stripped in `retrieve` put back on `createdAt`.
presentation :: Array Track -> Foreign
presentation data_ = toForeign { tracks: map withZ (fromMaybe [] (asArray (deepCamelCaseKeys (toForeign data_)))) }
  where
  withZ x = mergeForeign x (toForeign { createdAt: fromMaybe "undefined" (readStringAt "createdAt" x) <> "Z" })
