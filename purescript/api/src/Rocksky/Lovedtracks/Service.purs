module Rocksky.Lovedtracks.Service (likeTrack, unLikeTrack, getLovedTracks, getLovedTracksNumber) where

import Prelude
import Atproto.Api as Api
import Atproto.Common (tidNextStr)
import Consola as Log
import Data.Array (head)
import Data.Int as Int
import Data.JSDate (JSDate, toISOString)
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Nullable (Nullable, notNull, null, toMaybe, toNullable)
import Data.String (toLower)
import Data.Traversable (traverse)
import Drizzle.Builder (deleteFrom, innerJoin, insertForeign, limit, limitNumber, offsetNumber, onConflictDoNothing, orderBy, run, runDelete, runInsert, runInsertReturning, runUpdateReturning, selectFieldsFrom, selectFrom, updateForeign)
import Drizzle.Dialect (Postgres)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (Table, tableSQL, toSQL)
import Effect.Aff (Aff, error, throwError)
import Effect.Class (liftEffect)
import Foreign (Foreign)
import Nats (publishString)
import Node.Crypto (sha256Hex)
import Rocksky.Context (Context)
import Rocksky.Lib.Common (withFallbackAlbumArt)
import Rocksky.Lib.ExtractPdsFromDid (extractPdsFromDid)
import Rocksky.Lib.Foreign (mergeForeign, omitNulls, stringify, toForeign)
import Rocksky.Lib.RepoSettings (nowIso)
import Rocksky.Notifications.SongActivity (notifySongLike)
import Rocksky.Playlists.Service (atUriRepo, rkeyOf)
import Rocksky.Schema as T
import Rocksky.Schema.Tracks (SelectTrack)
import Rocksky.Schema.LovedTracks (SelectLovedTrack)
import Rocksky.Shouts.Service (strongRef, validate)

-- Keep the source's read-then-write behavior and its returned row identity.
save :: forall cols. Context -> Table Postgres cols -> SQL.SQL -> SQL.SQL -> Foreign -> Aff String
save ctx table idColumn condition fields = do
  existing :: Array { id :: String } <- run ctx.db (selectFieldsFrom { id: idColumn } table # where_ condition # limit 1)
  rows :: Array { id :: String } <- case head existing of
    Just row -> runUpdateReturning ctx.db (updateForeign table fields # where_ (SQL.eq idColumn (SQL.string row.id)))
    Nothing -> runInsertReturning ctx.db (insertForeign table [fields])
  case head rows of
    Just row -> pure row.id
    Nothing -> throwError (error "Database write returned no row")

ensure :: forall cols. Context -> Table Postgres cols -> SQL.SQL -> Foreign -> Aff Unit
ensure ctx table condition fields = do
  existing :: Array { found :: Int } <- run ctx.db (selectFieldsFrom { found: SQL.int 1 } table # where_ condition # limit 1)
  case head existing of
    Just _ -> pure unit
    Nothing -> runInsert ctx.db (insertForeign table [fields] # onConflictDoNothing)

likeTrack :: forall r t. Context ->
  { title :: String, artist :: String, album :: String, albumArtist :: String
  , albumArt :: Nullable String, trackNumber :: Nullable Number, duration :: Number
  , mbId :: Nullable String, composer :: Nullable String, lyrics :: Nullable String
  , discNumber :: Nullable Number, releaseDate :: Nullable JSDate, year :: Nullable Number | t }
  -> { id :: String | r } -> Api.Agent -> Aff (Nullable String)
likeTrack ctx track user agent = do
  let hash = sha256Hex (toLower (track.title <> " - " <> track.artist <> " - " <> track.album))
  trackId <- save ctx T.tracks (toSQL T.tracksC.id) (SQL.eq (toSQL T.tracksC.sha256) (SQL.string hash)) (toForeign
    { title: track.title, artist: track.artist, album: track.album, albumArt: withFallbackAlbumArt track.albumArt
    , albumArtist: track.albumArtist, trackNumber: track.trackNumber, duration: track.duration, mbId: track.mbId
    , composer: track.composer, lyrics: track.lyrics, discNumber: track.discNumber, sha256: hash })
  let artistHash = sha256Hex (toLower track.albumArtist)
  artistId <- save ctx T.artists (toSQL T.artistsC.id) (SQL.eq (toSQL T.artistsC.sha256) (SQL.string artistHash))
    (toForeign { name: track.albumArtist, sha256: artistHash })
  let albumHash = sha256Hex (toLower (track.album <> " - " <> track.albumArtist))
  releaseDate <- liftEffect (traverse toISOString (toMaybe track.releaseDate))
  albumId <- save ctx T.albums (toSQL T.albumsC.id) (SQL.eq (toSQL T.albumsC.sha256) (SQL.string albumHash))
    (mergeForeign (toForeign { title: track.album, artist: track.albumArtist, albumArt: withFallbackAlbumArt track.albumArt, year: track.year, sha256: albumHash }) (omitNulls (toForeign { releaseDate: toNullable releaseDate })))
  ensure ctx T.albumTracks (SQL.and (SQL.eq (toSQL T.albumTracksC.albumId) (SQL.string albumId)) (SQL.eq (toSQL T.albumTracksC.trackId) (SQL.string trackId))) (toForeign { albumId, trackId })
  ensure ctx T.artistTracks (SQL.and (SQL.eq (toSQL T.artistTracksC.artistId) (SQL.string artistId)) (SQL.eq (toSQL T.artistTracksC.trackId) (SQL.string trackId))) (toForeign { artistId, trackId })
  ensure ctx T.artistAlbums (SQL.and (SQL.eq (toSQL T.artistAlbumsC.artistId) (SQL.string artistId)) (SQL.eq (toSQL T.artistAlbumsC.albumId) (SQL.string albumId))) (toForeign { artistId, albumId })
  rows :: Array { uri :: Nullable String } <- run ctx.db (selectFieldsFrom { uri: toSQL T.tracksC.uri } T.tracks # where_ (SQL.eq (toSQL T.tracksC.id) (SQL.string trackId)) # limit 1)
  case head rows >>= toMaybe <<< _.uri of
    Just uri | uri /= "" -> do
      rkey <- liftEffect tidNextStr
      let repo = atUriRepo uri
      pds <- extractPdsFromDid repo
      subjectAgent <- liftEffect (Api.newAtpAgent (fromMaybe "" pds))
      subjectRecord <- Api.getRecord subjectAgent { repo, collection: "app.rocksky.song", rkey: rkeyOf uri }
      subject <- strongRef ctx uri subjectRecord.cid "[like] invalid ref"
      createdAt <- nowIso
      let record = toForeign { "$type": "app.rocksky.like", subject, createdAt }
      validate ctx "app.rocksky.like" record "Invalid record"
      ownDid <- liftEffect (Api.assertDid agent)
      res <- Api.createRecord agent { repo: ownDid, collection: "app.rocksky.like", rkey: notNull rkey, record, validate: false }
      liftEffect (Log.info ("Like record created at: " <> res.uri))
      notifySongLike ctx trackId uri user.id
      pure (notNull res.uri)
    _ -> do
      liftEffect (Log.warn ("[like] " <> trackId <> " has no song record, nothing to like"))
      pure null

unLikeTrack :: forall r. Context -> String -> { id :: String | r } -> Api.Agent -> Aff Unit
unLikeTrack ctx hash user agent = do
  tracks :: Array { id :: String } <- run ctx.db (selectFieldsFrom { id: toSQL T.tracksC.id } T.tracks # where_ (SQL.eq (toSQL T.tracksC.sha256) (SQL.string hash)) # limit 1)
  case head tracks of
    Nothing -> pure unit
    Just track -> do
      likes :: Array SelectLovedTrack <- run ctx.db (selectFrom T.lovedTracks # where_ (SQL.and (SQL.eq (toSQL T.lovedTracksC.userId) (SQL.string user.id)) (SQL.eq (toSQL T.lovedTracksC.trackId) (SQL.string track.id))) # limit 1)
      case head likes of
        Nothing -> pure unit
        Just liked -> case rkeyOf <$> toMaybe liked.uri of
          Just rkey | rkey /= "" -> do
            repo <- liftEffect (Api.assertDid agent)
            Api.deleteRecord agent { repo, collection: "app.rocksky.like", rkey }
          _ -> do
            runDelete ctx.db (deleteFrom T.lovedTracks # where_ (SQL.eq (toSQL T.lovedTracksC.id) (SQL.string liked.id)))
            createdAt <- liftEffect (toISOString liked.createdAt)
            liftEffect $ publishString ctx.nc "rocksky.unlike" $ stringify $ toForeign
              { uri: liked.uri, user_id: { xata_id: user.id }, track_id: { xata_id: track.id }
              , xata_createdat: createdAt, xata_id: liked.id, xata_updatedat: createdAt, xata_version: 0 }

getLovedTracks :: forall r. Context -> { id :: String | r } -> Int -> Int -> Aff (Array SelectTrack)
getLovedTracks ctx user size start = getLovedTracksNumber ctx user (Int.toNumber size) (Int.toNumber start)

getLovedTracksNumber :: forall r. Context -> { id :: String | r } -> Number -> Number -> Aff (Array SelectTrack)
getLovedTracksNumber ctx user size start = do
  rows :: Array { track :: SelectTrack } <- run ctx.db
    (selectFieldsFrom { track: tableSQL T.tracks } T.lovedTracks
      # innerJoin T.tracks (SQL.eq (toSQL T.lovedTracksC.trackId) (toSQL T.tracksC.id))
      # where_ (SQL.eq (toSQL T.lovedTracksC.userId) (SQL.string user.id))
      # orderBy [SQL.desc (toSQL T.lovedTracksC.createdAt)] # limitNumber size # offsetNumber start)
  pure (map _.track rows)
