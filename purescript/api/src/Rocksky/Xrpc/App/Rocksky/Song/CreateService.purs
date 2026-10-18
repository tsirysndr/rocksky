module Rocksky.Xrpc.App.Rocksky.Song.CreateService (saveTrack, saveWithPause, publishTrack) where

import Prelude
import Atproto.Api (Agent)
import Consola as Log
import Data.Array (head)
import Data.JSDate as Date
import Data.Maybe (Maybe(..), isJust)
import Data.Nullable (Nullable, toMaybe)
import Data.String (Pattern(..), Replacement(..), replaceAll, toLower)
import Drizzle.Builder (insertForeign, onConflictDoNothing, run, runInsertReturning, runUpdate, selectFrom, update)
import Drizzle.Dialect (Postgres)
import Drizzle.Query (where_)
import Drizzle.Schema (Table, toSQL)
import Drizzle.SQL as SQL
import Effect.Aff (Aff, attempt, error, throwError)
import Effect.Class (liftEffect)
import Foreign (Foreign)
import Nats (publishString)
import Node.Crypto (sha256Hex)
import Rocksky.Context (Context)
import Rocksky.Lib.Aff (sleep)
import Rocksky.Lib.Foreign as F
import Rocksky.Schema as T
import Rocksky.Schema.Albums (SelectAlbum)
import Rocksky.Schema.Artists (SelectArtist)
import Rocksky.Schema.Tracks (SelectTrack)
import Rocksky.Schema.AlbumTracks (SelectAlbumTrack)
import Rocksky.Schema.ArtistTracks (SelectArtistTrack)
import Rocksky.Schema.ArtistAlbums (SelectArtistAlbum)
import Rocksky.Types.Track (Track)
import Rocksky.Xrpc.App.Rocksky.Song.CreateRecords as Records

type Saved =
  { tries :: Int, track :: SelectTrack, album :: SelectAlbum, artist :: SelectArtist
  , albumTrack :: Maybe SelectAlbumTrack, artistTrack :: Maybe SelectArtistTrack, artistAlbum :: Maybe SelectArtistAlbum }

present :: Nullable String -> Boolean
present value = case toMaybe value of
  Just s -> s /= ""
  _ -> false

findRow :: forall cols r. Context -> Table Postgres cols -> SQL.SQL -> Aff (Maybe (Record r))
findRow ctx table condition = head <$> run ctx.db (selectFrom table # where_ condition)

required :: forall a. Maybe a -> Aff a
required = case _ of
  Just value -> pure value
  Nothing -> throwError (error "NoSuchElementException")

hash :: String -> SQL.SQL
hash = SQL.string <<< sha256Hex <<< toLower

ensureTrack :: Context -> Track -> Agent -> Aff String
ensureTrack ctx track agent = do
  row :: SelectTrack <- findRow ctx T.tracks (SQL.eq (toSQL T.tracksC.sha256) (hash (track.title <> " - " <> track.artist <> " - " <> track.album))) >>= required
  unless (present row.albumUri) do
    album :: Maybe SelectAlbum <- findRow ctx T.albums (SQL.eq (toSQL T.albumsC.sha256) (hash (track.album <> " - " <> track.albumArtist)))
    -- Only missing-row/update failures are swallowed; the lookup itself is not.
    void (attempt do
      albumRow <- required album
      runUpdate ctx.db (update T.tracks { albumUri: albumRow.uri } # where_ (SQL.eq (toSQL T.tracksC.id) (SQL.string row.id))))
  unless (present row.artistUri) do
    artist :: Maybe SelectArtist <- findRow ctx T.artists (SQL.eq (toSQL T.artistsC.sha256) (hash track.albumArtist))
    void (attempt do
      artistRow <- required artist
      runUpdate ctx.db (update T.tracks { artistUri: artistRow.uri } # where_ (SQL.eq (toSQL T.tracksC.id) (SQL.string row.id))))
  if present row.uri then required (toMaybe row.uri) else Records.putSong ctx track agent

ensureAlbum :: Context -> Track -> Agent -> Aff String
ensureAlbum ctx track agent = do
  row :: SelectAlbum <- findRow ctx T.albums (SQL.eq (toSQL T.albumsC.sha256) (hash (track.album <> " - " <> track.albumArtist))) >>= required
  if present row.uri then required (toMaybe row.uri) else Records.putAlbum ctx track agent

ensureArtist :: Context -> Track -> Agent -> Aff String
ensureArtist ctx track agent = do
  row :: SelectArtist <- findRow ctx T.artists (SQL.eq (toSQL T.artistsC.sha256) (hash track.albumArtist)) >>= required
  if present row.uri then required (toMaybe row.uri) else Records.putArtist ctx track agent

ensureLink :: forall cols r. Context -> Table Postgres cols -> Foreign -> Maybe (Record r) -> Aff (Maybe (Record r))
ensureLink ctx table values existing = case existing of
  Just row -> pure (Just row)
  Nothing -> head <$> runInsertReturning ctx.db (insertForeign table [values] # onConflictDoNothing)

saveTrack :: Context -> Track -> Agent -> Aff Saved
saveTrack = saveWithPause (sleep 1000)

saveWithPause :: Aff Unit -> Context -> Track -> Agent -> Aff Saved
saveWithPause pause ctx input agent = do
  -- Effect.all uses sequential traversal by default in the source.
  trackUri <- ensureTrack ctx input agent
  albumUri <- ensureAlbum ctx input agent
  artistUri <- ensureArtist ctx input agent
  let
    loop tries = do
      pause
      track :: SelectTrack <- findRow ctx T.tracks (SQL.eq (toSQL T.tracksC.uri) (SQL.string trackUri)) >>= required
      album :: SelectAlbum <- findRow ctx T.albums (SQL.eq (toSQL T.albumsC.uri) (SQL.string albumUri)) >>= required
      artist :: SelectArtist <- findRow ctx T.artists (SQL.eq (toSQL T.artistsC.uri) (SQL.string artistUri)) >>= required
      unless (present track.albumUri) (runUpdate ctx.db (update T.tracks { albumUri: album.uri } # where_ (SQL.eq (toSQL T.tracksC.id) (SQL.string track.id))))
      unless (present track.artistUri) (runUpdate ctx.db (update T.tracks { artistUri: artist.uri } # where_ (SQL.eq (toSQL T.tracksC.id) (SQL.string track.id))))
      at :: Maybe SelectAlbumTrack <- findRow ctx T.albumTracks (SQL.and (SQL.eq (toSQL T.albumTracksC.albumId) (SQL.string album.id)) (SQL.eq (toSQL T.albumTracksC.trackId) (SQL.string track.id)))
      art :: Maybe SelectArtistTrack <- findRow ctx T.artistTracks (SQL.and (SQL.eq (toSQL T.artistTracksC.artistId) (SQL.string artist.id)) (SQL.eq (toSQL T.artistTracksC.trackId) (SQL.string track.id)))
      aa :: Maybe SelectArtistAlbum <- findRow ctx T.artistAlbums (SQL.and (SQL.eq (toSQL T.artistAlbumsC.artistId) (SQL.string artist.id)) (SQL.eq (toSQL T.artistAlbumsC.albumId) (SQL.string album.id)))
      albumTrack <- ensureLink ctx T.albumTracks (F.toForeign { albumId: album.id, trackId: track.id }) at
      artistTrack <- ensureLink ctx T.artistTracks (F.toForeign { artistId: artist.id, trackId: track.id }) art
      artistAlbum <- ensureLink ctx T.artistAlbums (F.toForeign { artistId: artist.id, albumId: album.id }) aa
      let saved = { tries: tries + 1, track, album, artist, albumTrack, artistTrack, artistAlbum }
          complete = isJust albumTrack && isJust artistTrack && isJust artistAlbum && present track.albumUri && present track.artistUri
      liftEffect (Log.info (if complete then "Track saved successfully after " <> show (tries + 2) <> " tries" else "Track not yet saved, retrying... " <> show (tries + 2)))
      when (saved.tries == 15) (liftEffect (Log.error "Failed to save track after 15 tries"))
      if complete || saved.tries >= 15 then pure saved else loop saved.tries
  saved <- loop 0
  case saved.albumTrack, saved.artistTrack, saved.artistAlbum of
    Just at, Just art, Just aa | saved.tries < 15 -> publishTrack ctx saved.track at art aa
    _, _, _ -> pure unit
  pure saved

publishTrack :: Context -> SelectTrack -> SelectAlbumTrack -> SelectArtistTrack -> SelectArtistAlbum -> Aff Unit
publishTrack ctx track at art aa = do
  created <- liftEffect (Date.toISOString track.createdAt)
  updated <- liftEffect (Date.toISOString track.updatedAt)
  let trackView = F.mergeForeign (F.toForeign track) (F.toForeign { sha256: track.sha256, uri: track.uri, xata_createdat: created, xata_updatedat: updated, xata_id: track.id, xata_version: track.xataVersion })
  albumTrack <- relationship at (F.toForeign { album_id: { xata_id: at.albumId }, track_id: { xata_id: at.trackId } })
  artistTrack <- relationship art (F.toForeign { artist_id: { xata_id: art.artistId }, track_id: { xata_id: art.trackId } })
  artistAlbum <- relationship aa (F.toForeign { artist_id: { xata_id: aa.artistId }, album_id: { xata_id: aa.albumId } })
  let payload = F.toForeign { track: trackView, album_track: albumTrack, artist_track: artistTrack, artist_album: artistAlbum }
  liftEffect (publishString ctx.nc "rocksky.track" (replaceAll (Pattern "sha_256") (Replacement "sha256") (F.stringify (F.deepSnakeCaseKeys payload))))
  where
  relationship :: forall r. { id :: String, createdAt :: Date.JSDate, updatedAt :: Date.JSDate, xataVersion :: Nullable Int | r } -> Foreign -> Aff Foreign
  relationship row fields = do
    createdAt <- liftEffect (Date.toISOString row.createdAt)
    updatedAt <- liftEffect (Date.toISOString row.updatedAt)
    pure (F.mergeForeign fields (F.toForeign { xata_id: row.id, xata_createdat: createdAt, xata_updatedat: updatedAt, xata_version: row.xataVersion }))
