module Rocksky.Users.Details (register, counts, albumTracks) where

import Prelude
import Control.Parallel (parallel, sequential)
import Data.Array as A
import Data.Either (Either(..))
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Nullable (Nullable, toMaybe)
import Data.Int as Int
import Data.Number as Number
import Drizzle.Builder (leftJoin, limit, orderBy, run, selectFieldsFrom, selectFrom)
import Drizzle.Dialect (Postgres)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (Table, toSQL)
import Effect (Effect)
import Effect.Aff (Aff, attempt)
import Foreign (Foreign, isUndefined)
import Hono as Hono
import Rocksky.Context (Context)
import Rocksky.Lib.AuthVerifier (bearerFrom)
import Rocksky.Lib.Foreign as F
import Rocksky.Lib.Rest as Rest
import Rocksky.Lib.TrackLikes (withLikes)
import Rocksky.Lib.VerifyToken (verifyToken)
import Rocksky.Schema as T
import Rocksky.Users.Common as Common
import Rocksky.Users.Utils (dedupeTracksKeepLyrics)

field :: String -> Foreign -> Foreign
field key = fromMaybe F.undefined <<< F.path key
text :: String -> Foreign -> String
text key = F.stringValue <<< field key
countFallback :: Foreign -> Foreign
countFallback value = if F.truthy value then value else F.toForeign 1
countRows :: forall cols. Context -> Table Postgres cols -> SQL.SQL -> Aff Foreign
countRows ctx table condition = do
  rows <- run ctx.db (selectFieldsFrom { count: SQL.raw "COUNT(*)" } table # where_ condition) :: Aff (Array { count :: Foreign })
  _.count <$> Rest.firstRow rows
counts :: Context -> String -> String -> Aff { listeners :: Foreign, scrobbles :: Foreign }
counts ctx kind id = do
  let eq col = SQL.eq col (SQL.string id)
  result <- sequential $ { listeners: _, scrobbles: _ }
    <$> parallel (case kind of
        "artist" -> countRows ctx T.userArtists (eq (toSQL T.userArtistsC.artistId))
        "album" -> countRows ctx T.userAlbums (eq (toSQL T.userAlbumsC.albumId))
        _ -> countRows ctx T.userTracks (eq (toSQL T.userTracksC.trackId)))
    <*> parallel (countRows ctx T.scrobbles (eq (case kind of
        "artist" -> toSQL T.scrobblesC.artistId
        "album" -> toSQL T.scrobblesC.albumId
        _ -> toSQL T.scrobblesC.trackId)))
  pure { listeners: countFallback result.listeners, scrobbles: countFallback result.scrobbles }

albumTracks :: Array Foreign -> Array Foreign
albumTracks tracks = map F.toForeign (A.sortBy comparePosition (dedupeTracksKeepLyrics (map F.unsafeFromForeign tracks :: Array { disc_number :: Nullable Int, track_number :: Nullable Int, lyrics :: Nullable String })))
  where
  position n = if isUndefined (F.toForeign n) then 0.0 / 0.0 else fromMaybe 0.0 (Int.toNumber <$> toMaybe n)
  comparePosition a b =
    let diff = position a.track_number - position b.track_number
    in if Number.isNaN diff then EQ else compare diff 0.0

register :: Context -> Hono.App -> Effect Unit
register ctx app = do
  Common.get ctx app "/:did/app.rocksky.scrobble/:rkey" \c -> do
    rows <- run ctx.db (selectFrom T.scrobbles
      # leftJoin T.tracks (SQL.eq (toSQL T.scrobblesC.trackId) (toSQL T.tracksC.id))
      # leftJoin T.users (SQL.eq (toSQL T.scrobblesC.userId) (toSQL T.usersC.id))
      # where_ (SQL.eq (toSQL T.scrobblesC.uri) (SQL.string (Common.uri c "scrobble"))) # limit 1) :: Aff (Array {})
    case A.head rows of
      Nothing -> Rest.text c 404 "Scrobble not found"
      Just row -> do
        let value = F.toForeign row
        totals <- counts ctx "track" (text "tracks.id" value)
        Rest.json c 200 (F.mergeForeign value (F.toForeign { id: field "scrobbles.id" value, listeners: totals.listeners, scrobbles: totals.scrobbles, tags: [] :: Array Foreign }))
  Common.get ctx app "/:did/app.rocksky.artist/:rkey" \c -> do
    let uri = SQL.string (Common.uri c "artist")
    rows <- run ctx.db (selectFrom T.userArtists
      # leftJoin T.artists (SQL.eq (toSQL T.userArtistsC.artistId) (toSQL T.artistsC.id))
      # where_ (SQL.or (SQL.eq (toSQL T.userArtistsC.uri) uri) (SQL.eq (toSQL T.artistsC.uri) uri)) # limit 1) :: Aff (Array { artists :: Foreign })
    case A.head rows of
      Nothing -> Rest.text c 404 "Artist not found"
      Just row -> do
        totals <- counts ctx "artist" (text "id" row.artists)
        Rest.json c 200 (F.mergeForeign row.artists (F.toForeign { listeners: totals.listeners, scrobbles: totals.scrobbles, tags: [] :: Array Foreign }))
  Common.get ctx app "/:did/app.rocksky.album/:rkey" \c -> do
    let uri = SQL.string (Common.uri c "album")
    rows <- run ctx.db (selectFrom T.userAlbums
      # leftJoin T.albums (SQL.eq (toSQL T.userAlbumsC.albumId) (toSQL T.albumsC.id))
      # where_ (SQL.or (SQL.eq (toSQL T.userAlbumsC.uri) uri) (SQL.eq (toSQL T.albumsC.uri) uri)) # limit 1) :: Aff (Array { albums :: Foreign })
    case A.head rows of
      Nothing -> Rest.text c 404 "Album not found"
      Just row -> do
        let id = text "id" row.albums
        tracks <- run ctx.db (selectFrom T.albumTracks # leftJoin T.tracks (SQL.eq (toSQL T.albumTracksC.trackId) (toSQL T.tracksC.id))
          # where_ (SQL.eq (toSQL T.albumTracksC.albumId) (SQL.string id)) # orderBy [SQL.asc (toSQL T.tracksC.trackNumber)]) :: Aff (Array { tracks :: Foreign })
        totals <- counts ctx "album" id
        let label = fromMaybe F.undefined (A.head tracks <#> field "label" <<< _.tracks)
        Rest.json c 200 (F.mergeForeign row.albums (F.toForeign { listeners: totals.listeners, scrobbles: totals.scrobbles
          , label: if F.truthy label then label else F.toForeign "", tracks: albumTracks (map _.tracks tracks), tags: [] :: Array Foreign }))
  Common.get ctx app "/:did/app.rocksky.song/:rkey" \c -> do
    let uri = SQL.string (Common.uri c "song")
    found <- sequential $ { direct: _, user: _ }
      <$> parallel (run ctx.db (selectFrom T.tracks # where_ (SQL.eq (toSQL T.tracksC.uri) uri) # limit 1) :: Aff (Array {}))
      <*> parallel (run ctx.db (selectFrom T.userTracks # leftJoin T.tracks (SQL.eq (toSQL T.userTracksC.trackId) (toSQL T.tracksC.id))
        # where_ (SQL.eq (toSQL T.userTracksC.uri) uri) # limit 1) :: Aff (Array { tracks :: Foreign }))
    let selected = case A.head found.direct of
          Just row -> Just (F.toForeign row)
          Nothing -> _.tracks <$> A.head found.user
    case selected of
      Just track | F.truthy track -> do
        totals <- counts ctx "track" (text "id" track)
        Rest.json c 200 (F.mergeForeign track (F.toForeign { listeners: totals.listeners, scrobbles: totals.scrobbles, tags: [] :: Array Foreign }))
      _ -> Rest.text c 404 "Track not found"
  Common.get ctx app "/:did/app.rocksky.playlist/:rkey" \c -> do
    let uri = SQL.string (Common.uri c "playlist")
    rows <- run ctx.db (selectFrom T.playlists # leftJoin T.users (SQL.eq (toSQL T.playlistsC.createdBy) (toSQL T.usersC.id))
      # where_ (SQL.eq (toSQL T.playlistsC.uri) uri)) :: Aff (Array { playlists :: Foreign, users :: Foreign })
    case A.head rows of
      Nothing -> Rest.text c 404 "Playlist not found"
      Just row -> do
        tracks <- run ctx.db (selectFrom T.playlistTracks
          # leftJoin T.playlists (SQL.eq (toSQL T.playlistTracksC.playlistId) (toSQL T.playlistsC.id))
          # leftJoin T.tracks (SQL.eq (toSQL T.playlistTracksC.trackId) (toSQL T.tracksC.id))
          # where_ (SQL.eq (toSQL T.playlistsC.uri) uri) # orderBy [SQL.asc (toSQL T.playlistTracksC.createdAt)]) :: Aff (Array { tracks :: {} })
        did <- case bearerFrom (Hono.reqHeader c "authorization") of
          Nothing -> pure Nothing
          Just bearer -> attempt (verifyToken ctx.db bearer) <#> case _ of
            Left _ -> Nothing
            Right claims -> toMaybe claims.did
        decorated <- withLikes ctx (map _.tracks tracks) did (F.readStringAt "id" <<< F.toForeign)
        Rest.json c 200 (F.mergeForeign row.playlists (F.toForeign { curatedBy: row.users, tracks: decorated }))
