module Rocksky.Uploads.Ingest where

import Prelude
import Aws.S3 as S3
import Consola as Log
import Data.Array as A
import Data.Either (Either(..))
import Data.Int as Int
import Data.JSDate as Date
import Data.Maybe (Maybe(..), fromMaybe, isNothing)
import Data.Nullable (Nullable, null, notNull, toNullable)
import Data.String as String
import Data.Traversable (traverse)
import Drizzle.Builder (insertForeign, limit, run, runInsertReturning, selectFrom)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (toSQL)
import Effect (Effect)
import Effect.Aff (Aff, attempt, forkAff)
import Effect.Class (liftEffect)
import Foreign (Foreign)
import Foreign.Object as Object
import Hono as Hono
import JSURI (encodeURIComponent)
import MusicMetadata as Music
import Node.Buffer (Buffer)
import Node.Buffer as Buffer
import Rocksky.Context (Context)
import Rocksky.Lib.Agent (createAgent)
import Rocksky.Lib.Aff (sleep)
import Rocksky.Lib.Env (env)
import Rocksky.Lib.Foreign as F
import Rocksky.Lib.Rest as Rest
import Rocksky.Schema as T
import Rocksky.Schema.Users (SelectUser)
import Rocksky.Storage.App (resolveStorageClient)
import Rocksky.Tracks.Service (saveTrack)
import Rocksky.Typesense.Library (indexLibraryTrack)
import Rocksky.Uploads.Analysis (analyzeUploadAudio)
import Rocksky.Uploads.Metadata as Metadata
import Rocksky.Uploads.Replaygain (ensureReplayGain)
import Rocksky.Uploads.Stream (managedClient)

type StoreInput = { userId :: String, trackId :: String, key :: String, bytes :: Buffer, mime :: String, size :: Int, name :: String, provider :: Maybe String }
type Operations =
  { parse :: Buffer -> String -> Aff Foreign
  , gain :: Buffer -> String -> Aff Buffer
  , cover :: String -> Foreign -> String -> Aff Unit
  , save :: String -> Foreign -> Aff Boolean
  , pause :: Aff Unit
  , store :: StoreInput -> Aff (Nullable String)
  , analyze :: Buffer -> String -> String -> Aff Unit
  , index :: Foreign -> Aff Unit
  }
get :: String -> Foreign -> Foreign
get key value = fromMaybe (F.toForeign null) (F.path key value)
str :: String -> Foreign -> String
str key = F.stringValue <<< get key
encode :: String -> String
encode s = fromMaybe s (encodeURIComponent s)

trackPayload :: Metadata.Validated -> Foreign -> Nullable String -> Aff Foreign
trackPayload v metadata albumArt = do
  releaseDate <- liftEffect (traverse Date.parse v.releaseDate)
  let raw key = get ("common." <> key) metadata
  let mbId = fromMaybe (raw "musicbrainz_recordingid") (F.path "common.musicbrainz_trackid" metadata)
  let isrc = String.trim (fromMaybe "" (F.readStringAt "common.isrc.0" metadata))
  -- Uploads bypasses Track's schema in TS; keep raw lyrics arrays and the
  -- optional genre field instead of normalizing them through a decoder.
  pure (F.toForeign
    { title: v.title, artist: v.artist, album: v.album, albumArtist: v.albumArtist, duration: v.durationMs
    , trackNumber: raw "track.no", discNumber: v.discNumber, genre: raw "genre.0", genres: raw "genre", composer: raw "composer.0", albumArt
    , releaseDate: toNullable releaseDate, year: raw "year", lyrics: raw "lyrics", copyrightMessage: raw "copyright", mbId
    , isrc: toNullable (if isrc == "" then Nothing else Just isrc)
    , lastfmLink: "https://www.last.fm/music/" <> encode v.artist <> "/_/" <> encode v.title
    , artists: F.toForeign null, label: raw "label.0", artistPicture: F.toForeign null, spotifyLink: F.toForeign null, youtubeLink: F.toForeign null
    , tidalLink: F.toForeign null, appleMusicLink: F.toForeign null, deezerLink: F.toForeign null, timestamp: F.toForeign null })

operations :: Context -> Operations
operations ctx =
  { parse: Music.parseUploadBuffer
  , gain: ensureReplayGain
  , cover: \key bytes mime -> do
      client <- liftEffect managedClient
      S3.putObject client { bucket: env."S3_COVERS_BUCKET_NAME", key, body: F.unsafeFromForeign bytes, contentType: notNull mime, contentLength: null }
  , save: \did payload -> createAgent ctx did >>= case _ of
      Nothing -> pure false
      Just agent -> saveTrack ctx (F.unsafeFromForeign payload) agent *> pure true
  , pause: sleep 3000
  , store: \i -> do
      storage <- resolveStorageClient ctx i.userId i.provider
      S3.putObjectWithMetadata storage.client
        { bucket: storage.bucket, key: i.key, body: i.bytes, contentType: notNull i.mime, contentLength: notNull (Int.toNumber i.size) }
        (Object.fromHomogeneous { userId: i.userId, trackId: i.trackId, originalFilename: encode i.name })
      pure storage.storageProviderId
  , analyze: analyzeUploadAudio ctx
  , index: indexLibraryTrack ctx
  }

indexDocument :: String -> Foreign -> { id :: String, uploadedAt :: Date.JSDate } -> String -> String -> Int -> String -> Foreign
indexDocument userId track upload key mime size name = F.omitNulls (F.toForeign
  { id: upload.id, user_id: userId, track_id: get "id" track, title: get "title" track, artist: get "artist" track, album: get "album" track
  , album_artist: fromMaybe (get "artist" track) (F.path "albumArtist" track), genre: get "genre" track, composer: get "composer" track, year: get "year" track
  , duration: get "duration" track, album_art: get "albumArt" track, r2_key: key, mime_type: mime, file_size: size, original_filename: name
  , uploaded_at: Date.getTime upload.uploadedAt, mb_id: get "mbId" track, track_number: get "trackNumber" track, disc_number: get "discNumber" track })

background :: String -> Aff Unit -> Aff Unit
background label action = void (forkAff do
  result <- attempt action
  case result of
    Left e -> liftEffect (Log.warnF label [F.toForeign e])
    Right _ -> pure unit)

receive :: Context -> Operations -> Hono.Context -> SelectUser -> Buffer -> String -> Maybe String -> Aff Hono.Response
receive ctx ops c user bytes name provider = do
  mime <- liftEffect (Metadata.detectMime bytes)
  case mime of
    Nothing -> Rest.json c 400 (F.toForeign { error: "INVALID_FORMAT", message: "Only audio files are accepted (MP3, FLAC, M4A, OGG, WAV, AIFF)" })
    Just mediaType -> do
      parsed <- attempt (ops.parse bytes mediaType)
      case parsed of
        Left e -> do
          liftEffect (Log.errorF "[uploads] metadata parse error" [F.toForeign e])
          Rest.json c 422 (F.toForeign { error: "METADATA_PARSE_FAILED", message: "Could not read audio tags from this file" })
        Right metadata -> case Metadata.validate metadata of
          Left failure -> Rest.json c 422 failure
          Right valid -> do
            let ext = fromMaybe "bin" (Object.lookup mediaType Metadata.mimeExtensions)
            stored <- if valid.hasGainTag then pure bytes else ops.gain bytes ext
            let key = "music/" <> user.id <> "/" <> Metadata.contentSha256 stored <> "." <> ext
            duplicates <- run ctx.db (selectFrom T.userUploads # where_ (SQL.and (SQL.eq (toSQL T.userUploadsC.userId) (SQL.string user.id)) (SQL.eq (toSQL T.userUploadsC.r2Key) (SQL.string key))) # limit 1) :: Aff (Array { id :: String })
            case A.head duplicates of
              Just duplicate -> Rest.json c 409 (F.toForeign { error: "DUPLICATE_FILE", message: "This exact file is already in your library", uploadId: duplicate.id })
              Nothing -> do
                let sha = Metadata.metaSha256 valid.title valid.artist valid.album
                let trackQuery = selectFrom T.tracks # where_ (SQL.eq (toSQL T.tracksC.sha256) (SQL.string sha)) # limit 1
                existing <- run ctx.db trackQuery :: Aff (Array {})
                albumArt <- case F.readStringAt "common.picture.0.format" metadata >>= flip Object.lookup Metadata.pictureExtensions of
                  Nothing -> pure null
                  Just pictureExt -> do
                    let coverKey = "covers/" <> Metadata.coverMd5 valid.albumArtist valid.album <> "." <> pictureExt
                    uploaded <- attempt (ops.cover coverKey (get "common.picture.0.data" metadata) (str "common.picture.0.format" metadata))
                    case uploaded of
                      Right _ -> pure (notNull (env."CDN_URL" <> "/" <> coverKey))
                      Left e -> do
                        liftEffect (Log.warnF "[uploads] album art upload failed, continuing without it" [F.toForeign e])
                        pure null
                authorized <- if not (A.null existing) then pure true else do
                  payload <- trackPayload valid metadata albumArt
                  saved <- ops.save user.did payload
                  when saved ops.pause
                  pure saved
                if not authorized then Rest.text c 401 "Unauthorized" else do
                  tracks <- run ctx.db trackQuery :: Aff (Array {})
                  track <- F.toForeign <$> Rest.firstRow tracks
                  size <- liftEffect (Buffer.size stored)
                  let trackId = str "id" track
                  storageProviderId <- ops.store { userId: user.id, trackId, key, bytes: stored, mime: mediaType, size, name, provider }
                  uploads <- runInsertReturning ctx.db (insertForeign T.userUploads [F.toForeign
                    { userId: user.id, trackId, r2Key: key, mimeType: mediaType, fileSize: size, originalFilename: name, storageProviderId, sampleRate: get "format.sampleRate" metadata }]) :: Aff (Array { id :: String, uploadedAt :: Date.JSDate })
                  upload <- Rest.firstRow uploads
                  when (A.any (\field -> isNothing (F.path field track)) ["key", "bpm", "acoustidFingerprint"]) (background "[analysis] unexpected failure:" (ops.analyze stored ext trackId))
                  background "[typesense] index failed:" (ops.index (indexDocument user.id track upload key mediaType size name))
                  Rest.json c 200 (F.toForeign { uploadId: upload.id, trackId, track: { title: get "title" track, artist: get "artist" track, album: get "album" track, duration: get "duration" track, genre: get "genre" track } })

register :: Context -> Hono.App -> Effect Unit
register ctx = registerWith ctx (operations ctx)

registerWith :: Context -> Operations -> Hono.App -> Effect Unit
registerWith ctx ops a = Hono.post a "/track" \c -> Rest.withUser ctx c \user -> do
  form <- attempt (Hono.reqFormData c)
  case form of
    Left _ -> Rest.text c 400 "Invalid multipart form data"
    Right data_ -> do
      let file = Hono.formValue data_ "file"
      if not (F.truthy file) then Rest.json c 400 (F.toForeign { error: "NO_FILE", message: "No file provided" }) else do
        let opaque = F.unsafeFromForeign file :: Hono.FormFile
        bytes <- Hono.fileBuffer opaque
        let providerValue = Hono.formValue data_ "storage_provider_id"
        let provider = if F.truthy providerValue then Just (F.unsafeFromForeign providerValue) else Nothing
        receive ctx ops c user bytes (Hono.fileName opaque) provider
