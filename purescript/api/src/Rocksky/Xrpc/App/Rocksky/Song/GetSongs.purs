module Rocksky.Xrpc.App.Rocksky.Song.GetSongs (register, retrieveSongs, filterFields) where

import Prelude
import Atproto.XrpcServer as Xrpc
import Data.Array as A
import Data.JSDate as Date
import Data.Map as Map
import Data.Maybe (Maybe(..), fromMaybe, maybe)
import Data.Nullable (Nullable, toMaybe)
import Data.String (trim)
import Data.Traversable (traverse)
import Data.Tuple (Tuple(..))
import Drizzle.Builder (groupBy, innerJoin, limit, offset, orderBy, querySQL, run, selectFieldsFrom)
import Drizzle.Database (Database)
import Drizzle.Dialect (Postgres)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (tableSQL, toSQL)
import Effect (Effect)
import Effect.Aff (Aff)
import Effect.Class (liftEffect)
import Foreign (Foreign)
import Foreign.Object as Object
import Record as Record
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Lib.Aff (recoverWith, retryTransientDb, timeoutMs)
import Rocksky.Lib.DbQuery (readQuery)
import Rocksky.Lib.FilteredPage (filteredPage)
import Rocksky.Lib.Foreign as F
import Rocksky.Lib.QueryCache (queryCache)
import Rocksky.Lib.Rsql (RsqlFieldMap, RsqlFieldType(..), compileRsqlFilterParam)
import Rocksky.Schema as T
import Rocksky.Schema.Tracks (SelectTrack)
import Rocksky.Xrpc.App.Rocksky.Charts.Common (number)
import Rocksky.Xrpc.App.Rocksky.Playlist.GetPlaylist as Playlist
import Rocksky.Xrpc.Util as Util

type QueryParams = { limit :: Nullable Int, offset :: Nullable Int, filter :: Nullable String, genre :: Nullable String, mbid :: Nullable String, isrc :: Nullable String, spotifyId :: Nullable String }

filterFields :: RsqlFieldMap
filterFields = Object.insert "createdAt" { column: toSQL T.tracksC.createdAt, type_: DateField } (Object.delete "addedAt" Playlist.filterFields)

projection :: { id :: SQL.SQL, title :: SQL.SQL, artist :: SQL.SQL, albumArtist :: SQL.SQL, albumArt :: SQL.SQL, album :: SQL.SQL, uri :: SQL.SQL, albumUri :: SQL.SQL, artistUri :: SQL.SQL, sha256 :: SQL.SQL, trackNumber :: SQL.SQL, discNumber :: SQL.SQL, duration :: SQL.SQL, copyrightMessage :: SQL.SQL, createdAt :: SQL.SQL }
projection =
  { id: toSQL T.tracksC.id, title: toSQL T.tracksC.title, artist: toSQL T.tracksC.artist, albumArtist: toSQL T.tracksC.albumArtist
  , albumArt: toSQL T.tracksC.albumArt, album: toSQL T.tracksC.album, uri: toSQL T.tracksC.uri, albumUri: toSQL T.tracksC.albumUri
  , artistUri: toSQL T.tracksC.artistUri, sha256: toSQL T.tracksC.sha256, trackNumber: toSQL T.tracksC.trackNumber
  , discNumber: toSQL T.tracksC.discNumber, duration: toSQL T.tracksC.duration, copyrightMessage: toSQL T.tracksC.copyrightMessage, createdAt: toSQL T.tracksC.createdAt }

present :: SelectTrack -> Number -> Number -> Effect Foreign
present track playCount uniqueListeners = do
  createdAt <- Date.toISOString track.createdAt
  pure (F.toForeign
    { id: track.id, uri: track.uri, title: track.title, artist: track.artist, artistUri: track.artistUri
    , album: track.album, albumUri: track.albumUri, albumArt: track.albumArt, albumArtist: track.albumArtist
    , copyrightMessage: track.copyrightMessage, discNumber: track.discNumber, duration: track.duration, sha256: track.sha256
    , trackNumber: track.trackNumber, playCount, uniqueListeners, createdAt })

retrieveSongs :: Database Postgres -> QueryParams -> Aff (Array Foreign)
retrieveSongs db params = do
  filter <- compileRsqlFilterParam (toMaybe params.filter) filterFields
  let size = fromMaybe 100 (toMaybe params.limit)
      start = fromMaybe 0 (toMaybe params.offset)
      nonempty value = trim <$> toMaybe value >>= \s -> if s == "" then Nothing else Just s
      direct = SQL.orAll (A.catMaybes
        [ (SQL.eq (toSQL T.tracksC.mbId) <<< SQL.string) <$> nonempty params.mbid
        , (SQL.eq (toSQL T.tracksC.isrc) <<< SQL.string) <$> nonempty params.isrc
        , (SQL.eq (toSQL T.tracksC.spotifyLink) <<< SQL.string <<< ("https://open.spotify.com/track/" <> _)) <$> nonempty params.spotifyId ])
  case direct of
    Just condition -> do
      rows :: Array SelectTrack <- run db (selectFieldsFrom (Record.merge projection { mbId: toSQL T.tracksC.mbId, isrc: toSQL T.tracksC.isrc }) T.tracks
        # where_ (maybe condition (SQL.and condition) filter) # limit size # offset start)
      liftEffect (traverse (\track -> do
        view <- present track 0.0 0.0
        pure (F.mergeForeign view (F.toForeign { mbid: track.mbId, isrc: track.isrc }))) rows)
    Nothing -> do
      let genre = case toMaybe params.genre of
            Just value | value /= "" -> Just (SQL.template ["EXISTS (SELECT 1 FROM ", " WHERE ", " = ", " AND ", " @> ARRAY[", "]::text[])"]
              [tableSQL T.artists, toSQL T.artistsC.name, toSQL T.tracksC.albumArtist, toSQL T.artistsC.genres, SQL.string value])
            _ -> Nothing
      page <- case filter of
        Nothing -> pure Nothing
        Just condition -> Just <$> filteredPage db (querySQL db (selectFieldsFrom
          { id: SQL.as "id" (SQL.template ["", ""] [toSQL T.tracksC.id])
          , created_at: SQL.as "created_at" (SQL.template ["", ""] [toSQL T.tracksC.createdAt]) } T.tracks
          # where_ (maybe condition (SQL.and condition) genre))) size start
      if page == Just [] then pure [] else do
        ranked :: Array { trackId :: Nullable String, play_count :: Foreign, unique_listeners :: Foreign } <- run db
          (selectFieldsFrom { trackId: toSQL T.scrobblesC.trackId, play_count: SQL.as "play_count" SQL.count
            , unique_listeners: SQL.as "unique_listeners" (SQL.countDistinct (toSQL T.scrobblesC.userId)) } T.scrobbles
            # innerJoin T.tracks (SQL.eq (toSQL T.scrobblesC.trackId) (toSQL T.tracksC.id))
            # maybe identity where_ (case page of
                Just ids -> Just (SQL.inArray (toSQL T.scrobblesC.trackId) (map SQL.string ids))
                Nothing -> genre)
            # groupBy [toSQL T.scrobblesC.trackId] # orderBy [SQL.desc (SQL.countDistinct (toSQL T.scrobblesC.userId))]
            # limit size # offset (if page == Nothing then start else 0))
        if page == Nothing && A.null ranked then pure [] else do
          let ids = fromMaybe (A.mapMaybe (toMaybe <<< _.trackId) ranked) page
          tracks :: Array SelectTrack <- run db (selectFieldsFrom projection T.tracks # where_ (SQL.inArray (toSQL T.tracksC.id) (map SQL.string ids)))
          let byId = Map.fromFoldable (map (\track -> Tuple track.id track) tracks)
              counts = Map.fromFoldable (A.mapMaybe (\rank -> (\id -> Tuple id rank) <$> toMaybe rank.trackId) ranked)
          liftEffect (traverse (\track -> do
            let rank = Map.lookup track.id counts
            present track (fromMaybe 0.0 (number <<< _.play_count <$> rank)) (fromMaybe 0.0 (number <<< _.unique_listeners <$> rank)))
            (A.mapMaybe (flip Map.lookup byId) ids))

register :: Server -> Context -> Effect Unit
register server ctx = do
  cached <- queryCache (\params -> timeoutMs 120000 (retryTransientDb (readQuery ctx.pools "Failed to retrieve tracks" \db -> retrieveSongs db params))) 30000 200
  Xrpc.method server "app.rocksky.song.getSongs"
    { auth: Nothing, handler: \input -> do
        let params = Util.params input :: QueryParams
        void (compileRsqlFilterParam (toMaybe params.filter) filterFields)
        tracks <- recoverWith [] (cached params)
        pure (Util.json { tracks }) }
