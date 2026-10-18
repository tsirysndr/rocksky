module Rocksky.Nowplaying.Publication (ScrobbleRow, findScrobble, publishScrobble) where

import Prelude
import Control.Parallel (parallel, sequential)
import Data.Array (head)
import Data.JSDate (toISOString)
import Data.Maybe (Maybe(..))
import Data.String (Pattern(..), Replacement(..), replaceAll)
import Drizzle.Builder (innerJoin, insertForeign, limit, run, runInsert, selectFieldsFrom, selectFrom)
import Drizzle.Dialect (Postgres)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (Table, tableSQL, toSQL)
import Effect.Aff (Aff, error, forkAff, throwError)
import Effect.Class (liftEffect)
import Foreign (Foreign)
import Nats (publishString)
import Rocksky.Context (Context)
import Rocksky.Lib.FeedCache (bumpAllFeedVersions, bumpScrobblesVersion)
import Rocksky.Lib.Foreign (deepSnakeCaseKeys, mergeForeign, stringifyPretty, toForeign)
import Rocksky.Lib.StatsCache (invalidateStats)
import Rocksky.Schema as T
import Rocksky.Schema.Scrobbles (SelectScrobble)
import Rocksky.Schema.Tracks (SelectTrack)
import Rocksky.Schema.Albums (SelectAlbum)
import Rocksky.Schema.Artists (SelectArtist)
import Rocksky.Schema.Users (SelectUser)
import Rocksky.Schema.UserAlbums (SelectUserAlbum)
import Rocksky.Schema.UserArtists (SelectUserArtist)
import Rocksky.Schema.UserTracks (SelectUserTrack)
import Rocksky.Schema.AlbumTracks (SelectAlbumTrack)
import Rocksky.Schema.ArtistTracks (SelectArtistTrack)
import Rocksky.Schema.ArtistAlbums (SelectArtistAlbum)
import Rocksky.Tracks.Service (rowEvent, publishTrack)

type ScrobbleRow = { scrobble :: SelectScrobble, track :: SelectTrack, album :: SelectAlbum, artist :: SelectArtist, user :: SelectUser }

findScrobble :: Context -> SQL.SQL -> Aff (Maybe ScrobbleRow)
findScrobble ctx condition = head <$> run ctx.db
  (selectFieldsFrom { scrobble: tableSQL T.scrobbles, track: tableSQL T.tracks, album: tableSQL T.albums, artist: tableSQL T.artists, user: tableSQL T.users } T.scrobbles
    # innerJoin T.tracks (SQL.eq (toSQL T.scrobblesC.trackId) (toSQL T.tracksC.id))
    # innerJoin T.albums (SQL.eq (toSQL T.scrobblesC.albumId) (toSQL T.albumsC.id))
    # innerJoin T.artists (SQL.eq (toSQL T.scrobblesC.artistId) (toSQL T.artistsC.id))
    # innerJoin T.users (SQL.eq (toSQL T.scrobblesC.userId) (toSQL T.usersC.id))
    # where_ condition # limit 1)

findRow :: forall cols r. Context -> Table Postgres cols -> SQL.SQL -> Aff (Maybe (Record r))
findRow ctx table condition = head <$> run ctx.db (selectFrom table # where_ condition # limit 1)

required :: forall a. Maybe a -> Aff a
required = case _ of
  Just row -> pure row
  Nothing -> throwError (error "Missing scrobble publication relationship")

ensure :: forall cols r. Context -> Table Postgres cols -> SQL.SQL -> Foreign -> Maybe (Record r) -> Aff (Record r)
ensure ctx table condition fields existing = case existing of
  Just row -> pure row
  Nothing -> do
    runInsert ctx.db (insertForeign table [fields])
    findRow ctx table condition >>= required

publishScrobble :: Context -> String -> Aff Unit
publishScrobble ctx id = do
  row <- findScrobble ctx (SQL.eq (toSQL T.scrobblesC.id) (SQL.string id)) >>= required
  let uaCondition = SQL.eq (toSQL T.userAlbumsC.albumId) (SQL.string row.album.id)
  let urCondition = SQL.eq (toSQL T.userArtistsC.artistId) (SQL.string row.artist.id)
  let utCondition = SQL.eq (toSQL T.userTracksC.trackId) (SQL.string row.track.id)
  links :: { ua :: Maybe SelectUserAlbum, ur :: Maybe SelectUserArtist, ut :: Maybe SelectUserTrack, at :: Maybe SelectAlbumTrack, art :: Maybe SelectArtistTrack, aa :: Maybe SelectArtistAlbum } <- sequential $
    { ua: _, ur: _, ut: _, at: _, art: _, aa: _ }
      <$> parallel (findRow ctx T.userAlbums uaCondition)
      <*> parallel (findRow ctx T.userArtists urCondition)
      <*> parallel (findRow ctx T.userTracks utCondition)
      <*> parallel (findRow ctx T.albumTracks (SQL.eq (toSQL T.albumTracksC.trackId) (SQL.string row.track.id)))
      <*> parallel (findRow ctx T.artistTracks (SQL.eq (toSQL T.artistTracksC.trackId) (SQL.string row.track.id)))
      <*> parallel (findRow ctx T.artistAlbums (SQL.and (SQL.eq (toSQL T.artistAlbumsC.albumId) (SQL.string row.album.id)) (SQL.eq (toSQL T.artistAlbumsC.artistId) (SQL.string row.artist.id))))
  ur <- ensure ctx T.userArtists urCondition (toForeign { userId: row.user.id, artistId: row.artist.id, uri: row.artist.uri, scrobbles: 1 }) links.ur
  ua <- ensure ctx T.userAlbums uaCondition (toForeign { userId: row.user.id, albumId: row.album.id, uri: row.album.uri, scrobbles: 1 }) links.ua
  ut <- ensure ctx T.userTracks utCondition (toForeign { userId: row.user.id, trackId: row.track.id, uri: row.track.uri, scrobbles: 1 }) links.ut
  at <- required links.at
  art <- required links.art
  aa <- required links.aa
  scrobble <- rowEvent row.scrobble
  track <- rowEvent row.track
  album <- rowEvent row.album
  artist <- rowEvent row.artist
  user <- rowEvent row.user
  userAlbum <- rowEvent ua
  userArtist <- rowEvent ur
  userTrack <- rowEvent ut
  albumTrack <- rowEvent at
  artistTrack <- rowEvent art
  artistAlbum <- rowEvent aa
  timestamp <- liftEffect (toISOString row.scrobble.timestamp)
  let payload = toForeign
        { scrobble: mergeForeign scrobble (toForeign { album_id: album, artist_id: artist, track_id: track, user_id: user, timestamp })
        , user_album: mergeForeign userAlbum (toForeign { album_id: { xata_id: row.album.id }, user_id: { xata_id: row.user.id } })
        , user_artist: mergeForeign userArtist (toForeign { artist_id: { xata_id: row.artist.id }, user_id: { xata_id: row.user.id } })
        , user_track: mergeForeign userTrack (toForeign { track_id: { xata_id: row.track.id }, user_id: { xata_id: row.user.id } })
        , album_track: mergeForeign albumTrack (toForeign { album_id: { xata_id: row.album.id }, track_id: { xata_id: row.track.id } })
        , artist_track: mergeForeign artistTrack (toForeign { artist_id: { xata_id: row.artist.id }, track_id: { xata_id: row.track.id } })
        , artist_album: mergeForeign artistAlbum (toForeign { artist_id: { xata_id: row.artist.id }, album_id: { xata_id: row.album.id } })
        }
  liftEffect (publishString ctx.nc "rocksky.scrobble" (replaceAll (Pattern "sha_256") (Replacement "sha256") (stringifyPretty (deepSnakeCaseKeys payload))))
  void (forkAff (bumpAllFeedVersions ctx))
  void (forkAff (bumpScrobblesVersion ctx))
  void (forkAff (invalidateStats ctx [Just row.user.did, Just row.user.handle]))
  publishTrack ctx row.track at art aa
