module Rocksky.Tracks.Service (saveTrack, publishTrack, rowEvent) where

import Prelude
import Atproto.Api (Agent)
import Consola as Log
import Data.Array (head)
import Data.JSDate (JSDate, toISOString)
import Data.Maybe (Maybe(..), isNothing)
import Data.Nullable (Nullable, notNull, toMaybe, toNullable)
import Data.String (Pattern(..), Replacement(..), replaceAll, toLower)
import Drizzle.Builder (insertForeign, limit, onConflictDoNothing, orderBy, run, runInsert, runUpdate, selectFrom, update)
import Drizzle.Dialect (Postgres)
import Drizzle.Query (where_)
import Drizzle.Schema (Table, toSQL)
import Drizzle.SQL as SQL
import Effect.Aff (Aff)
import Effect.Class (liftEffect)
import Foreign (Foreign)
import Nats (publishString)
import Node.Crypto (sha256Hex)
import Rocksky.Context (Context)
import Rocksky.Lib.Aff (sleep)
import Rocksky.Lib.Credits (creditsArtistRow)
import Rocksky.Lib.Foreign (deepSnakeCaseKeys, mergeForeign, stringify, toForeign)
import Rocksky.Nowplaying.Records (putAlbumRecord, putArtistRecord, putSongRecord, trackLookupOrder, trackLookupWhere)
import Rocksky.Schema as T
import Rocksky.Schema.Albums (SelectAlbum)
import Rocksky.Schema.Artists (SelectArtist)
import Rocksky.Schema.Tracks (SelectTrack)
import Rocksky.Schema.AlbumTracks (SelectAlbumTrack)
import Rocksky.Schema.ArtistTracks (SelectArtistTrack)
import Rocksky.Schema.ArtistAlbums (SelectArtistAlbum)
import Rocksky.Types.Track (Track)

present :: Nullable String -> Boolean
present value = case toMaybe value of
  Just s -> s /= ""
  Nothing -> false

findRow :: forall cols r. Context -> Table Postgres cols -> SQL.SQL -> Aff (Maybe (Record r))
findRow ctx table condition = head <$> run ctx.db (selectFrom table # where_ condition # limit 1)

rowEvent :: forall r. { id :: String, createdAt :: JSDate, updatedAt :: JSDate | r } -> Aff Foreign
rowEvent row = do
  createdAt <- liftEffect (toISOString row.createdAt)
  updatedAt <- liftEffect (toISOString row.updatedAt)
  pure (mergeForeign (toForeign row) (toForeign { xata_id: row.id, xata_createdat: createdAt, xata_updatedat: updatedAt }))

publishTrack :: Context -> SelectTrack -> SelectAlbumTrack -> SelectArtistTrack -> SelectArtistAlbum -> Aff Unit
publishTrack ctx track albumTrack artistTrack artistAlbum = do
  trackView <- rowEvent track
  albumTrackView <- rowEvent albumTrack
  artistTrackView <- rowEvent artistTrack
  artistAlbumView <- rowEvent artistAlbum
  let payload = toForeign
        { track: trackView
        , album_track: mergeForeign albumTrackView (toForeign { album_id: { xata_id: albumTrack.albumId }, track_id: { xata_id: albumTrack.trackId } })
        , artist_track: mergeForeign artistTrackView (toForeign { artist_id: { xata_id: artistTrack.artistId }, track_id: { xata_id: artistTrack.trackId } })
        , artist_album: mergeForeign artistAlbumView (toForeign { artist_id: { xata_id: artistAlbum.artistId }, album_id: { xata_id: artistAlbum.albumId } })
        }
  liftEffect (publishString ctx.nc "rocksky.track" (replaceAll (Pattern "sha_256") (Replacement "sha256") (stringify (deepSnakeCaseKeys payload))))

saveTrack :: Context -> Track -> Agent -> Aff Unit
saveTrack ctx original agent = do
  rows :: Array SelectTrack <- run ctx.db (selectFrom T.tracks # where_ (trackLookupWhere original) # orderBy [trackLookupOrder original] # limit 1)
  let existingTrack = head rows
  let track = case existingTrack of
        Just existing | not (present original.albumArt) -> original { albumArt = existing.albumArt }
        _ -> original
  let priorUri = toNullable (existingTrack >>= toMaybe <<< _.uri)
  trackUri <- if present priorUri then pure priorUri else putSongRecord ctx track agent
  let albumHash = sha256Hex (toLower (track.album <> " - " <> track.albumArtist))
  let artistHash = sha256Hex (toLower track.albumArtist)
  case existingTrack of
    Nothing -> pure unit
    Just existing -> do
      unless (present existing.albumUri) do
        album :: Maybe SelectAlbum <- findRow ctx T.albums (SQL.eq (toSQL T.albumsC.sha256) (SQL.string albumHash))
        case album of
          Nothing -> pure unit
          Just row -> runUpdate ctx.db (update T.tracks { albumUri: row.uri } # where_ (SQL.eq (toSQL T.tracksC.id) (SQL.string existing.id)))
      unless (present existing.artistUri) do
        artist :: Maybe SelectArtist <- findRow ctx T.artists (SQL.eq (toSQL T.artistsC.sha256) (SQL.string artistHash))
        case artist of
          Nothing -> pure unit
          Just row -> runUpdate ctx.db (update T.tracks { artistUri: row.uri } # where_ (SQL.eq (toSQL T.tracksC.id) (SQL.string existing.id)))
  existingArtist :: Maybe SelectArtist <- findRow ctx T.artists (SQL.eq (toSQL T.artistsC.sha256) (SQL.string artistHash))
  let oldArtistUri = toNullable (existingArtist >>= toMaybe <<< _.uri)
  artistUri <- if present oldArtistUri then pure oldArtistUri else putArtistRecord ctx track agent
  existingAlbum :: Maybe SelectAlbum <- findRow ctx T.albums (SQL.eq (toSQL T.albumsC.sha256) (SQL.string albumHash))
  let albumTrack = case existingAlbum of
        Just album | not (present track.albumArt) -> track { albumArt = album.albumArt }
        _ -> track
  let oldAlbumUri = toNullable (existingAlbum >>= toMaybe <<< _.uri)
  albumUri <- if present oldAlbumUri then pure oldAlbumUri else putAlbumRecord ctx albumTrack agent
  poll trackUri albumUri artistUri 0
  where
  poll trackUri albumUri artistUri tries
    | tries >= 15 = liftEffect (Log.info "Failed to save track after 15 tries")
    | otherwise = do
        track :: Maybe SelectTrack <- findRow ctx T.tracks (SQL.eq (toSQL T.tracksC.uri) (SQL.param trackUri))
        album :: Maybe SelectAlbum <- findRow ctx T.albums (SQL.eq (toSQL T.albumsC.uri) (SQL.param albumUri))
        artist :: Maybe SelectArtist <- findRow ctx T.artists (SQL.eq (toSQL T.artistsC.uri) (SQL.param artistUri))
        case track, album, artist of
          Just t, Just a, Just ar ->
            if not (creditsArtistRow (notNull ar.name) t) then
              liftEffect (Log.warn ("[tracks] " <> t.title <> " — " <> t.artist <> " does not credit " <> ar.name <> ", skipping junctions"))
            else do
              at :: Maybe SelectAlbumTrack <- findRow ctx T.albumTracks (SQL.and (SQL.eq (toSQL T.albumTracksC.albumId) (SQL.string a.id)) (SQL.eq (toSQL T.albumTracksC.trackId) (SQL.string t.id)))
              art :: Maybe SelectArtistTrack <- findRow ctx T.artistTracks (SQL.and (SQL.eq (toSQL T.artistTracksC.artistId) (SQL.string ar.id)) (SQL.eq (toSQL T.artistTracksC.trackId) (SQL.string t.id)))
              aa :: Maybe SelectArtistAlbum <- findRow ctx T.artistAlbums (SQL.and (SQL.eq (toSQL T.artistAlbumsC.artistId) (SQL.string ar.id)) (SQL.eq (toSQL T.artistAlbumsC.albumId) (SQL.string a.id)))
              when (isNothing at) $ runInsert ctx.db (insertForeign T.albumTracks [toForeign { albumId: a.id, trackId: t.id }] # onConflictDoNothing)
              when (isNothing art) $ runInsert ctx.db (insertForeign T.artistTracks [toForeign { artistId: ar.id, trackId: t.id }] # onConflictDoNothing)
              when (isNothing aa) $ runInsert ctx.db (insertForeign T.artistAlbums [toForeign { artistId: ar.id, albumId: a.id }] # onConflictDoNothing)
              unless (present t.albumUri) $ runUpdate ctx.db (update T.tracks { albumUri: a.uri } # where_ (SQL.eq (toSQL T.tracksC.id) (SQL.string t.id)))
              unless (present t.artistUri) $ runUpdate ctx.db (update T.tracks { artistUri: ar.uri } # where_ (SQL.eq (toSQL T.tracksC.id) (SQL.string t.id)))
              case at, art, aa of
                Just albumTrack, Just artistTrack, Just artistAlbum | present t.albumUri && present t.artistUri -> do
                  liftEffect (Log.info ("Track saved successfully after " <> show (tries + 1) <> " tries"))
                  publishTrack ctx t albumTrack artistTrack artistAlbum
                _, _, _ -> do
                  liftEffect (Log.info ("Track not yet saved, retrying... " <> show (tries + 2)))
                  when (tries == 14) $ liftEffect (Log.infoF "Final track persistence state" [toForeign (toNullable at), toForeign (toNullable art), toForeign (toNullable aa), toForeign ar, toForeign a, toForeign t])
                  sleep 1000
                  poll trackUri albumUri artistUri (tries + 1)
          _, _, _ -> do
            liftEffect (Log.info ("Track not yet saved (uri not saved), retrying... " <> show (tries + 1)))
            sleep 1000
            poll trackUri albumUri artistUri (tries + 1)
