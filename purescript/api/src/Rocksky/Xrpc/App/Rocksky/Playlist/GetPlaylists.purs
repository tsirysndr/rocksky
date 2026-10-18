module Rocksky.Xrpc.App.Rocksky.Playlist.GetPlaylists (register, retrievePlaylists, filterFields, presentation) where

import Prelude
import Atproto.XrpcServer as Xrpc
import Data.JSDate as Date
import Data.Maybe (Maybe(..), fromMaybe, maybe)
import Data.Nullable (Nullable, toMaybe)
import Data.Traversable (traverse)
import Data.Tuple (Tuple(..))
import Drizzle.Builder (innerJoin, leftJoin, limit, offset, orderBy, querySQL, run, selectDistinctFields, selectFieldsFrom)
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
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Lib.Aff (recoverWith, retryTransientDb, timeoutMs)
import Rocksky.Lib.DbQuery (dbQuery)
import Rocksky.Lib.Foreign (deleteKeys, mergeForeign, toForeign)
import Rocksky.Lib.Rsql (RsqlFieldMap, compileRsqlFilterParam, field)
import Rocksky.Schema as T
import Rocksky.Schema.Playlists (SelectPlaylist)
import Rocksky.Schema.Users (SelectUser)
import Rocksky.Xrpc.App.Rocksky.Actor.GetActorPlaylists as Actor
import Rocksky.Xrpc.Util as Util

type QueryParams = { limit :: Nullable Int, offset :: Nullable Int, filter :: Nullable String }
type PlaylistRow = { playlists :: SelectPlaylist, users :: SelectUser, trackCount :: Foreign, trackArts :: Nullable (Array String) }

filterFields :: RsqlFieldMap
filterFields = Object.union Actor.filterFields (Object.fromFoldable
  [ Tuple "curatorDid" (field (toSQL T.usersC.did)), Tuple "curatorHandle" (field (toSQL T.usersC.handle))
  , Tuple "curatorName" (field (toSQL T.usersC.displayName)) ])

presentation :: PlaylistRow -> Effect Foreign
presentation row = do
  createdAt <- Date.toISOString row.playlists.createdAt
  updatedAt <- Date.toISOString row.playlists.updatedAt
  pure (mergeForeign (deleteKeys ["name", "picture"] (toForeign row.playlists)) (toForeign
    { title: row.playlists.name, coverImageUrl: row.playlists.picture, curatorDId: row.users.did
    , curatorName: row.users.displayName, curatorAvatarUrl: row.users.avatar, curatorHandle: row.users.handle
    , createdAt, updatedAt, trackCount: row.trackCount, trackArts: fromMaybe [] (toMaybe row.trackArts) }))

retrievePlaylists :: Database Postgres -> QueryParams -> Aff (Array Foreign)
retrievePlaylists db params = do
  condition <- compileRsqlFilterParam (toMaybe params.filter) filterFields
  let
    contents = Actor.filtersOnTracks (toMaybe params.filter)
    projection = { playlists: tableSQL T.playlists, users: tableSQL T.users, trackCount: Actor.trackCount, trackArts: Actor.trackArts }
    base = (if contents then selectDistinctFields else selectFieldsFrom) projection T.userPlaylists
      # leftJoin T.playlists (SQL.eq (toSQL T.userPlaylistsC.playlistId) (toSQL T.playlistsC.id))
      # leftJoin T.users (SQL.eq (toSQL T.userPlaylistsC.userId) (toSQL T.usersC.id))
    matched = SQL.exists (SQL.template ["(", ")"] [querySQL db (selectFieldsFrom { one: SQL.raw "1" } T.playlistTracks
      # innerJoin T.tracks (SQL.eq (toSQL T.playlistTracksC.trackId) (toSQL T.tracksC.id))
      # where_ (maybe identity SQL.and condition (SQL.eq (toSQL T.playlistTracksC.playlistId) (toSQL T.playlistsC.id))))])
    filtered = if contents then base # where_ matched else maybe base (\c -> base # where_ c) condition
    orDefault fallback value = case toMaybe value of
      Just n | n /= 0 -> n
      _ -> fallback
  rows :: Array PlaylistRow <- run db (filtered # orderBy [SQL.desc (toSQL T.playlistsC.createdAt)]
    # limit (orDefault 20 params.limit) # offset (orDefault 0 params.offset))
  liftEffect (traverse presentation rows)

register :: Server -> Context -> Effect Unit
register server ctx = Xrpc.method server "app.rocksky.playlist.getPlaylists"
  { auth: Nothing
  , handler: \input -> do
      let params = Util.params input :: QueryParams
      void (compileRsqlFilterParam (toMaybe params.filter) filterFields)
      playlists <- recoverWith [] (timeoutMs 10000 (retryTransientDb (dbQuery ctx.pools "Failed to retrieve playlists" \db -> retrievePlaylists db params)))
      pure (Util.json { playlists }) }
