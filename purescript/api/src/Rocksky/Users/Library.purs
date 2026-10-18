module Rocksky.Users.Library (register) where

import Prelude
import Axios as Axios
import Data.Array as A
import Data.Maybe (fromMaybe)
import Data.Number as Number
import Data.Traversable (for_)
import Drizzle.Builder (leftJoin, limitNumber, offsetNumber, orderBy, run, selectFieldsFrom, selectFrom)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (tableSQL, toSQL)
import Effect (Effect)
import Effect.Aff (Aff)
import Foreign (Foreign)
import Hono as Hono
import Rocksky.Context (Context)
import Rocksky.Lib.Foreign as F
import Rocksky.Lib.Rest as Rest
import Rocksky.Schema as T
import Rocksky.Users.Common as Common

register :: Context -> Hono.App -> Effect Unit
register ctx app = do
  Common.get ctx app "/:did/likes" \c -> do
    let did = Hono.reqParam c "did"
    rows <- run ctx.db (selectFrom T.lovedTracks
      # leftJoin T.tracks (SQL.eq (toSQL T.lovedTracksC.trackId) (toSQL T.tracksC.id))
      # leftJoin T.users (SQL.eq (toSQL T.lovedTracksC.userId) (toSQL T.usersC.id))
      # where_ (SQL.or (SQL.eq (toSQL T.usersC.did) (SQL.string did)) (SQL.eq (toSQL T.usersC.handle) (SQL.string did)))
      # orderBy [SQL.desc (toSQL T.lovedTracksC.createdAt)] # limitNumber (Common.queryNumber c "size" 10.0) # offsetNumber (Common.queryNumber c "offset" 0.0)) :: Aff (Array {})
    Rest.json c 200 (F.toForeign rows)
  for_ [ { route: "/:handle/scrobbles", param: "handle", method: "library.getScrobbles", tags: false }
       , { route: "/:did/albums", param: "did", method: "library.getTopAlbums", tags: true }
       , { route: "/:did/artists", param: "did", method: "library.getTopArtists", tags: true }
       , { route: "/:did/tracks", param: "did", method: "library.getTopTracks", tags: true }
       ] \config -> Common.get ctx app config.route \c -> do
    response <- Axios.post ctx.analytics config.method (F.toForeign
      { user_did: Hono.reqParam c config.param, pagination: { skip: Common.queryNumber c "offset" 0.0, take: Common.queryNumber c "size" 10.0 } })
    let body = if config.tags then F.toForeign (map (\item -> F.mergeForeign item (F.toForeign { tags: [] :: Array Foreign })) (F.unsafeFromForeign (Axios.data_ response) :: Array Foreign)) else (Axios.data_ response)
    Rest.json c 200 body
  Common.get ctx app "/:did/playlists" \c -> do
    let did = Hono.reqParam c "did"
    let trackCount = SQL.as "trackCount" (SQL.template ["(SELECT COUNT(*) FROM ", " WHERE ", " = ", ")"] [tableSQL T.playlistTracks, toSQL T.playlistTracksC.playlistId, toSQL T.playlistsC.id])
    rows <- run ctx.db (selectFieldsFrom { playlists: tableSQL T.playlists, trackCount } T.playlists
      # leftJoin T.users (SQL.eq (toSQL T.playlistsC.createdBy) (toSQL T.usersC.id))
      # where_ (SQL.or (SQL.eq (toSQL T.usersC.did) (SQL.string did)) (SQL.eq (toSQL T.usersC.handle) (SQL.string did)))
      # offsetNumber (Common.queryNumber c "offset" 0.0) # limitNumber (Common.queryNumber c "size" 10.0)) :: Aff (Array { playlists :: Foreign, trackCount :: Foreign })
    Rest.json c 200 (F.toForeign (map (\r -> F.mergeForeign r.playlists (F.toForeign { trackCount: fromMaybe (0.0 / 0.0) (Number.fromString (F.stringValue r.trackCount)) })) rows))
  Common.get ctx app "/:did/app.rocksky.artist/:rkey/tracks" \c -> do
    rows <- run ctx.db (selectFrom T.artistTracks
      # leftJoin T.tracks (SQL.eq (toSQL T.artistTracksC.trackId) (toSQL T.tracksC.id))
      -- Source compares artistId directly with the AT URI, without resolving it.
      # where_ (SQL.eq (toSQL T.artistTracksC.artistId) (SQL.string (Common.uri c "artist")))
      # orderBy [SQL.desc (toSQL T.artistTracksC.xataVersion)] # limitNumber (Common.queryNumber c "size" 10.0) # offsetNumber (Common.queryNumber c "offset" 0.0)) :: Aff (Array { tracks :: Foreign, artist_tracks :: { xataVersion :: Foreign } })
    Rest.json c 200 (F.toForeign (map (\r -> F.mergeForeign r.tracks (F.toForeign { xata_version: r.artist_tracks.xataVersion })) rows))
  Common.get ctx app "/:did/app.rocksky.artist/:rkey/albums" \c -> do
    rows <- run ctx.db (selectFrom T.artistAlbums
      # leftJoin T.albums (SQL.eq (toSQL T.artistAlbumsC.albumId) (toSQL T.albumsC.id))
      # where_ (SQL.eq (toSQL T.artistAlbumsC.artistId) (SQL.string (Common.uri c "artist")))
      # orderBy [SQL.desc (toSQL T.artistAlbumsC.xataVersion)] # limitNumber (Common.queryNumber c "size" 10.0) # offsetNumber (Common.queryNumber c "offset" 0.0)) :: Aff (Array { albums :: Foreign, artist_albums :: { xataVersion :: Foreign } })
    let albums = map (\r -> F.mergeForeign r.albums (F.toForeign { xata_version: r.artist_albums.xataVersion })) rows
    Rest.json c 200 (F.toForeign (A.nubBy (\a b -> compare (F.readStringAt "id" a) (F.readStringAt "id" b)) albums))
