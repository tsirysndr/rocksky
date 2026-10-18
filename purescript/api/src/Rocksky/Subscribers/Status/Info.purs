module Rocksky.Subscribers.Status.Info where

import Prelude
import Control.Alt ((<|>))
import Consola as Log
import Data.Either (Either(..))
import Data.Maybe (Maybe(..), fromMaybe, isJust)
import Data.Nullable (null, toMaybe, toNullable)
import Effect.Aff (Aff, attempt)
import Effect.Class (liftEffect)
import Foreign (Foreign)
import Rocksky.Context (Context)
import Rocksky.Lib.Common (withFallbackAlbumArt)
import Rocksky.Lib.Foreign (omitNulls, path, readArrayAt, readNumberAt, readStringAt, toForeign, undefined)
import Rocksky.Lib.Matching (matchTrack, matchingRequest)

type Info = { recordingMbId :: Maybe String, albumArt :: Maybe String, trackNumber :: Maybe Number }

artist :: Foreign -> String
artist raw = fromMaybe "" (readStringAt "artists.0.name" raw <|> readStringAt "artist" raw)

album :: Foreign -> Maybe String
album raw = readStringAt "album.name" raw <|> readStringAt "album" raw <|> readStringAt "album_name" raw

source :: Foreign -> String
source raw = fromMaybe (if isJust (readArrayAt "artists" raw) then "spotify" else "listenbrainz") (readStringAt "source" raw)

positive :: Maybe Number -> Maybe Number
positive n = n >>= \v -> if v > 0.0 then Just v else Nothing

resolveTrackInfo :: Context -> Foreign -> Aff Info
resolveTrackInfo ctx raw = do
  let name = fromMaybe "" (readStringAt "name" raw)
  let performer = artist raw
  let initial = { recordingMbId: readStringAt "recording_mb_id" raw, albumArt: Nothing, trackNumber: positive (readNumberAt "track_number" raw <|> readNumberAt "trackNumber" raw) }
  if name == "" || performer == "" then pure initial else do
    result <- attempt do
      let spotify = readStringAt "external_urls.spotify" raw <|>
            if readStringAt "source" raw == Just "spotify" || isJust (readArrayAt "artists" raw) then readStringAt "id" raw else Nothing
      request <- matchingRequest (toForeign
        { title: name, artist: performer, artists: fromMaybe undefined (path "artists" raw)
        , album: fromMaybe "" (album raw), duration: toNullable (readNumberAt "duration_ms" raw)
        , mbId: toNullable initial.recordingMbId, isrc: toNullable (readStringAt "external_ids.isrc" raw), spotifyLink: toNullable spotify })
      found <- matchTrack ctx request null
      pure case toMaybe found of
        Nothing -> initial
        Just c -> { recordingMbId: initial.recordingMbId <|> toMaybe c.identifiers.musicbrainzRecordingId, albumArt: toMaybe c.albumArt, trackNumber: initial.trackNumber <|> toMaybe c.trackNumber }
    case result of
      Right info -> pure info
      Left e -> do
        liftEffect (Log.warnF "[status] Matching unavailable; preserving source metadata" [toForeign e])
        pure initial

normalizeTrack :: Foreign -> Info -> Foreign
normalizeTrack raw info = omitNulls $ toForeign
  { name: fromMaybe "" (readStringAt "name" raw), artist: artist raw, album: toNullable (album raw)
  , albumCoverUrl: withFallbackAlbumArt (toNullable (readStringAt "album.cover" raw <|> readStringAt "albumCoverUrl" raw <|> info.albumArt))
  , durationMs: fromMaybe 0.0 (readNumberAt "duration_ms" raw), source: source raw
  , recordingMbId: toNullable info.recordingMbId, trackNumber: toNullable (positive info.trackNumber) }
