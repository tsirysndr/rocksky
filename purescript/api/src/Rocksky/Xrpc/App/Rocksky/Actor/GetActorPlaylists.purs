module Rocksky.Xrpc.App.Rocksky.Actor.GetActorPlaylists (register, retrieveActorPlaylists, filterFields, filtersOnTracks, trackCount, trackArts) where

import Prelude
import Atproto.XrpcServer as Xrpc
import Data.Array (any)
import Data.JSDate as Date
import Data.Maybe (Maybe(..), fromMaybe, maybe)
import Data.Nullable (Nullable, toMaybe)
import Data.Traversable (traverse)
import Data.Tuple (Tuple(..))
import Drizzle.Builder (innerJoin, leftJoin, limit, offset, querySQL, run, selectFieldsFrom)
import Drizzle.Database (Database)
import Drizzle.Dialect (Postgres)
import Drizzle.Query (where_)
import Drizzle.SQL (SQL)
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
import Rocksky.Lib.Foreign (mergeForeign, toForeign)
import Rocksky.Lib.Rsql (RsqlFieldMap, RsqlFieldType(..), compileRsqlFilterParam, field, rsqlSelectors)
import Rocksky.Schema as T
import Rocksky.Schema.Playlists (SelectPlaylist)
import Rocksky.Schema.Users (SelectUser)
import Rocksky.Xrpc.Util as Util

type QueryParams = { did :: String, limit :: Int, offset :: Int, filter :: Nullable String }

filterFields :: RsqlFieldMap
filterFields = Object.fromFoldable
  [ Tuple "name" (field (toSQL T.playlistsC.name)), Tuple "title" (field (toSQL T.playlistsC.name))
  , Tuple "description" (field (toSQL T.playlistsC.description)), Tuple "uri" (field (toSQL T.playlistsC.uri))
  , Tuple "spotifyLink" (field (toSQL T.playlistsC.spotifyLink)), Tuple "tidalLink" (field (toSQL T.playlistsC.tidalLink))
  , Tuple "appleMusicLink" (field (toSQL T.playlistsC.appleMusicLink))
  , Tuple "createdAt" { column: toSQL T.playlistsC.createdAt, type_: DateField }
  , Tuple "updatedAt" { column: toSQL T.playlistsC.updatedAt, type_: DateField }
  , Tuple "track.title" (field (toSQL T.tracksC.title)), Tuple "track.artist" (field (toSQL T.tracksC.artist))
  , Tuple "track.album" (field (toSQL T.tracksC.album)), Tuple "track.albumArtist" (field (toSQL T.tracksC.albumArtist)) ]

filtersOnTracks :: Maybe String -> Boolean
filtersOnTracks = any (\selector -> selector == "track.title" || selector == "track.artist" || selector == "track.album" || selector == "track.albumArtist") <<< rsqlSelectors

trackCount :: SQL
trackCount = SQL.as "trackCount" (SQL.template ["(SELECT COUNT(*) FROM ", " WHERE ", " = ", ")"]
  [tableSQL T.playlistTracks, toSQL T.playlistTracksC.playlistId, toSQL T.playlistsC.id])

trackArts :: SQL
trackArts = SQL.as "trackArts" (SQL.template
  ["(SELECT COALESCE(array_agg(art), '{}') FROM (SELECT t.album_art AS art FROM ", " pt JOIN ", " t ON pt.track_id = t.xata_id WHERE pt.playlist_id = ", " AND t.album_art IS NOT NULL GROUP BY t.album_art ORDER BY MIN(pt.xata_createdat) LIMIT 4) arts)"]
  [tableSQL T.playlistTracks, tableSQL T.tracks, toSQL T.playlistsC.id])

retrieveActorPlaylists :: Database Postgres -> QueryParams -> Aff (Array Foreign)
retrieveActorPlaylists db params = do
  condition <- compileRsqlFilterParam (toMaybe params.filter) filterFields
  let actor = SQL.or (SQL.eq (toSQL T.usersC.did) (SQL.string params.did)) (SQL.eq (toSQL T.usersC.handle) (SQL.string params.did))
      whereCondition = maybe actor (SQL.and actor) condition
      matched = SQL.exists (SQL.template ["(", ")"] [querySQL db (selectFieldsFrom { one: SQL.raw "1" } T.playlistTracks
        # innerJoin T.tracks (SQL.eq (toSQL T.playlistTracksC.trackId) (toSQL T.tracksC.id))
        # where_ (SQL.and (SQL.eq (toSQL T.playlistTracksC.playlistId) (toSQL T.playlistsC.id)) whereCondition))])
  rows :: Array { users :: SelectUser, playlists :: SelectPlaylist, trackCount :: Foreign, trackArts :: Nullable (Array String) } <- run db
    (selectFieldsFrom { users: tableSQL T.users, playlists: tableSQL T.playlists, trackCount, trackArts } T.playlists
      # leftJoin T.users (SQL.eq (toSQL T.playlistsC.createdBy) (toSQL T.usersC.id))
      # where_ (if filtersOnTracks (toMaybe params.filter) then matched else whereCondition)
      # offset params.offset # limit params.limit)
  liftEffect (traverse (\row -> do
    createdAt <- Date.toISOString row.playlists.createdAt
    updatedAt <- Date.toISOString row.playlists.updatedAt
    pure (mergeForeign (toForeign row.playlists) (toForeign
      { trackCount: row.trackCount, trackArts: fromMaybe [] (toMaybe row.trackArts), title: row.playlists.name
      , coverImageUrl: row.playlists.picture, curatorDId: row.users.did, curatorName: row.users.displayName
      , curatorAvatarUrl: row.users.avatar, curatorHandle: row.users.handle, createdAt, updatedAt }))) rows)

register :: Server -> Context -> Effect Unit
register server ctx = Xrpc.method server "app.rocksky.actor.getActorPlaylists"
  { auth: Nothing
  , handler: \input -> do
      let params = Util.params input :: QueryParams
      void (compileRsqlFilterParam (toMaybe params.filter) filterFields)
      playlists <- recoverWith [] $ timeoutMs 120000 $ retryTransientDb $
        dbQuery ctx.pools "Failed to retrieve user playlists" \db -> retrieveActorPlaylists db params
      pure (Util.json { playlists })
  }
