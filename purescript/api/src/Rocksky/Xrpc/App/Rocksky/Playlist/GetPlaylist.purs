module Rocksky.Xrpc.App.Rocksky.Playlist.GetPlaylist (register, retrieve, retrieveWithDb, canonicalUri, filterFields) where

import Prelude
import Atproto.XrpcServer as Xrpc
import Control.Parallel (parallel, sequential)
import Data.Array as A
import Data.JSDate as Date
import Data.Maybe (Maybe(..), maybe)
import Data.Nullable (Nullable, toMaybe)
import Data.String (Pattern(..), split, stripPrefix)
import Data.Traversable (traverse)
import Data.Tuple (Tuple(..))
import Drizzle.Builder (leftJoin, limit, orderBy, run, selectFieldsFrom)
import Drizzle.Database (Database)
import Drizzle.Dialect (Postgres)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (tableSQL, toSQL)
import Effect (Effect)
import Effect.Aff (Aff, error, throwError)
import Effect.Class (liftEffect)
import Foreign (Foreign)
import Foreign.Object as Object
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Lib.Aff (recoverWith, retryTransientDb, timeoutMs)
import Rocksky.Lib.DbQuery (dbQuery)
import Rocksky.Lib.Foreign (deleteKeys, mergeForeign, toForeign)
import Rocksky.Lib.Rsql (RsqlFieldMap, RsqlFieldType(..), compileRsqlFilterParam, field)
import Rocksky.Lib.TrackLikes (withLikes)
import Rocksky.Schema as T
import Rocksky.Schema.Playlists (SelectPlaylist)
import Rocksky.Schema.Tracks (SelectTrack)
import Rocksky.Schema.Users (SelectUser)
import Rocksky.Xrpc.App.Rocksky.Actor.GetActorPlaylists (trackCount)
import Rocksky.Xrpc.Util as Util

type QueryParams = { uri :: String, filter :: Nullable String }

filterFields :: RsqlFieldMap
filterFields = Object.fromFoldable
  [ Tuple "title" (field (toSQL T.tracksC.title)), Tuple "artist" (field (toSQL T.tracksC.artist))
  , Tuple "album" (field (toSQL T.tracksC.album)), Tuple "albumArtist" (field (toSQL T.tracksC.albumArtist))
  , Tuple "genre" (field (toSQL T.tracksC.genre)), Tuple "composer" (field (toSQL T.tracksC.composer)), Tuple "label" (field (toSQL T.tracksC.label))
  , Tuple "duration" { column: toSQL T.tracksC.duration, type_: NumberField }
  , Tuple "trackNumber" { column: toSQL T.tracksC.trackNumber, type_: NumberField }
  , Tuple "discNumber" { column: toSQL T.tracksC.discNumber, type_: NumberField }
  , Tuple "mbId" (field (toSQL T.tracksC.mbId)), Tuple "isrc" (field (toSQL T.tracksC.isrc)), Tuple "sha256" (field (toSQL T.tracksC.sha256))
  , Tuple "uri" (field (toSQL T.tracksC.uri)), Tuple "albumUri" (field (toSQL T.tracksC.albumUri)), Tuple "artistUri" (field (toSQL T.tracksC.artistUri))
  , Tuple "addedAt" { column: toSQL T.playlistTracksC.addedAt, type_: DateField } ]

canonicalUri :: Database Postgres -> String -> Aff String
canonicalUri db uri = do
  let parts = split (Pattern "/") (maybe uri identity (stripPrefix (Pattern "at://") uri))
  case A.index parts 0, A.index parts 1, A.index parts 2 of
    Just authority, Just collection, Just rkey | authority /= "" && rkey /= "" && stripPrefix (Pattern "did:") authority == Nothing -> do
      users :: Array { did :: String } <- run db (selectFieldsFrom { did: toSQL T.usersC.did } T.users
        # where_ (SQL.eq (toSQL T.usersC.handle) (SQL.string authority)) # limit 1)
      pure (maybe uri (\user -> "at://" <> user.did <> "/" <> collection <> "/" <> rkey) (A.head users))
    _, _, _ -> pure uri

retrieve :: Context -> QueryParams -> Maybe String -> Aff Foreign
retrieve ctx params did = dbQuery ctx.pools "Failed to retrieve playlist" \db -> retrieveWithDb (ctx { db = db }) params did

retrieveWithDb :: Context -> QueryParams -> Maybe String -> Aff Foreign
retrieveWithDb ctx params did = do
  let db = ctx.db
  uri <- canonicalUri db params.uri
  condition <- compileRsqlFilterParam (toMaybe params.filter) filterFields
  let match = SQL.eq (toSQL T.playlistsC.uri) (SQL.string uri)
  result <- sequential $ { playlists: _, tracks: _ }
    <$> parallel (run db (selectFieldsFrom { playlists: tableSQL T.playlists, users: tableSQL T.users, trackCount } T.userPlaylists
      # leftJoin T.playlists (SQL.eq (toSQL T.userPlaylistsC.playlistId) (toSQL T.playlistsC.id))
      # leftJoin T.users (SQL.eq (toSQL T.userPlaylistsC.userId) (toSQL T.usersC.id)) # where_ match)
        :: Aff (Array { playlists :: Nullable SelectPlaylist, users :: SelectUser, trackCount :: Foreign }))
    <*> parallel (do
      rows :: Array { tracks :: SelectTrack } <- run db (selectFieldsFrom { tracks: tableSQL T.tracks } T.playlistTracks
        # leftJoin T.tracks (SQL.eq (toSQL T.playlistTracksC.trackId) (toSQL T.tracksC.id))
        # leftJoin T.playlists (SQL.eq (toSQL T.playlistTracksC.playlistId) (toSQL T.playlistsC.id))
        # where_ (maybe match (SQL.and match) condition)
        # orderBy [SQL.asc (toSQL T.playlistTracksC.addedAt), SQL.asc (toSQL T.playlistTracksC.createdAt)])
      withLikes (ctx { db = db }) (map _.tracks rows) did (Just <<< _.id))
  case A.head result.playlists of
    Just row | Just playlist <- toMaybe row.playlists -> liftEffect do
      tracks <- traverse (\track -> do
        createdAt <- Date.toISOString track.createdAt
        updatedAt <- Date.toISOString track.updatedAt
        pure (mergeForeign (deleteKeys ["lyrics"] (toForeign track)) (toForeign { createdAt, updatedAt }))) result.tracks
      createdAt <- Date.toISOString playlist.createdAt
      updatedAt <- Date.toISOString playlist.updatedAt
      pure (mergeForeign (deleteKeys ["name", "picture"] (toForeign playlist)) (toForeign
        { tracks, title: playlist.name, coverImageUrl: playlist.picture, curatorDId: row.users.did, curatorName: row.users.displayName
        , curatorAvatarUrl: row.users.avatar, curatorHandle: row.users.handle, createdAt, updatedAt, trackCount: row.trackCount }))
    _ -> throwError (error ("Playlist not found: " <> uri))

register :: Server -> Context -> Effect Unit
register server ctx = Xrpc.method server "app.rocksky.playlist.getPlaylist"
  { auth: Just ctx.authVerifier
  , handler: \input -> do
      let params = Util.params input :: QueryParams
      void (compileRsqlFilterParam (toMaybe params.filter) filterFields)
      Xrpc.Json <$> recoverWith (toForeign {}) (timeoutMs 10000 (retryTransientDb (retrieve ctx params (Util.authDid input)))) }
