-- Publication boundary of nowplaying.service.ts; orchestration lives in Service.
module Rocksky.Nowplaying.Records
  ( putArtistRecord, putAlbumRecord, putSongRecord, putScrobbleRecord
  , songFields, trackLookupWhere, trackLookupOrder
  ) where

import Prelude
import Atproto.Api as Api
import Atproto.Common (tidNextStr)
import Consola as Log
import Data.JSDate (toISOString)
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Nullable (Nullable, null, notNull, toMaybe, toNullable)
import Data.String (toLower)
import Data.Traversable (traverse)
import Dayjs as Dayjs
import Drizzle.SQL as SQL
import Drizzle.Schema (toSQL)
import Effect.Aff (Aff, error, throwError)
import Effect.Class (liftEffect)
import Foreign (Foreign)
import Node.Crypto (sha256Hex)
import Rocksky.Context (Context)
import Rocksky.Lib.Aff (recoverWith)
import Rocksky.Lib.Common (withFallbackAlbumArt)
import Rocksky.Lib.DurableRecord (publishDurableRecord)
import Rocksky.Lib.Foreign (mergeForeign, omitNulls, toForeign)
import Rocksky.Lib.RecordPosition (recordPosition)
import Rocksky.Lib.RepoSettings (nowIso)
import Rocksky.Schema as T
import Rocksky.Shouts.Service (validate)
import Rocksky.Types.Track (Track)

trackLookupWhere :: forall r. { title :: String, artist :: String, album :: String | r } -> SQL.SQL
trackLookupWhere t = SQL.eq (toSQL T.tracksC.sha256) (SQL.string (sha256Hex (toLower (t.title <> " - " <> t.artist <> " - " <> t.album))))

trackLookupOrder :: forall a. a -> SQL.SQL
trackLookupOrder _ = toSQL T.tracksC.id

nonempty :: Nullable String -> Nullable String
nonempty value = case toMaybe value of
  Just s | s /= "" -> notNull s
  _ -> null

songFields :: Track -> Aff Foreign
songFields track = do
  releaseDate <- liftEffect (traverse toISOString (toMaybe track.releaseDate))
  pure $ omitNulls $ toForeign
    { title: track.title, artist: track.artist, artists: track.artists
    , album: track.album, albumArtist: track.albumArtist, duration: track.duration
    , releaseDate: toNullable releaseDate, year: track.year
    , albumArtUrl: withFallbackAlbumArt track.albumArt
    , composer: nonempty track.composer, lyrics: nonempty track.lyrics
    , trackNumber: recordPosition track.trackNumber, discNumber: recordPosition track.discNumber
    , copyrightMessage: nonempty track.copyrightMessage, spotifyLink: nonempty track.spotifyLink
    , tags: fromMaybe [] (toMaybe track.genres), mbid: track.mbId, isrc: track.isrc }

put :: Context -> Api.Agent -> String -> String -> String -> Foreign -> Aff (Nullable String)
put ctx agent collection label rkey record = do
  validate ctx collection record "Invalid record"
  recoverWith null do
    repo <- liftEffect (Api.assertDid agent)
    result <- Api.putRecord agent { repo, collection, rkey, record, validate: false, swapRecord: Nothing }
    liftEffect (Log.info (label <> " record created at " <> result.uri))
    pure (notNull result.uri)

putArtistRecord :: Context -> Track -> Api.Agent -> Aff (Nullable String)
putArtistRecord ctx track agent = do
  rkey <- liftEffect tidNextStr
  createdAt <- nowIso
  let record = omitNulls (toForeign { "$type": "app.rocksky.artist", name: track.albumArtist, createdAt, pictureUrl: nonempty track.artistPicture, tags: fromMaybe [] (toMaybe track.genres) })
  put ctx agent "app.rocksky.artist" "Artist" rkey record

putAlbumRecord :: Context -> Track -> Api.Agent -> Aff (Nullable String)
putAlbumRecord ctx track agent = do
  rkey <- liftEffect tidNextStr
  releaseDate <- liftEffect (traverse toISOString (toMaybe track.releaseDate))
  createdAt <- nowIso
  let record = omitNulls (toForeign { "$type": "app.rocksky.album", title: track.album, artist: track.albumArtist, year: track.year, releaseDate: toNullable releaseDate, createdAt, albumArtUrl: withFallbackAlbumArt track.albumArt })
  put ctx agent "app.rocksky.album" "Album" rkey record

putSongRecord :: Context -> Track -> Api.Agent -> Aff (Nullable String)
putSongRecord ctx track agent = do
  rkey <- liftEffect tidNextStr
  fields <- songFields track
  createdAt <- nowIso
  put ctx agent "app.rocksky.song" "Song" rkey (mergeForeign fields (toForeign { "$type": "app.rocksky.song", createdAt }))

putScrobbleRecord :: Context -> Track -> Api.Agent -> Maybe String -> Aff (Nullable String)
putScrobbleRecord ctx track agent durableRkey = do
  rkey <- case durableRkey of
    Just key -> pure key
    Nothing -> liftEffect tidNextStr
  fields <- songFields track
  createdAt <- case toMaybe track.timestamp of
    Just timestamp | timestamp /= 0.0 -> case Dayjs.toISOString (Dayjs.unix timestamp) of
      Just iso -> pure iso
      Nothing -> throwError (error "Invalid time value")
    _ -> nowIso
  let record = mergeForeign fields (toForeign { "$type": "app.rocksky.scrobble", createdAt })
  validate ctx "app.rocksky.scrobble" record "Invalid record"
  recoverWith null do
    repo <- liftEffect (Api.assertDid agent)
    let durable = case durableRkey of
          Just key -> key /= ""
          Nothing -> false
    let create = Api.putRecord agent { repo, collection: "app.rocksky.scrobble", rkey, record, validate: false, swapRecord: if durable then Just Nothing else Nothing }
    uri <- if durable then publishDurableRecord create (Api.getRecord agent { repo, collection: "app.rocksky.scrobble", rkey })
      else _.uri <$> create
    liftEffect (Log.info ("Scrobble record created at " <> uri))
    pure (notNull uri)
