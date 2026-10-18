-- | Upload validation and identity rules from uploads/app.ts. Keep raw parser
-- | output: lyrics/picture arrays and native tags must not be normalized away.
module Rocksky.Uploads.Metadata where

import Prelude
import Data.Array as A
import Data.Either (Either(..))
import Data.Foldable (foldl)
import Data.Maybe (Maybe(..), fromMaybe, isJust)
import Data.Number as Number
import Data.String as S
import Data.String.CodeUnits as CU
import Effect (Effect)
import Foreign (Foreign)
import Foreign.Object as Object
import Node.Buffer (Buffer)
import Node.Buffer as Buffer
import Node.Crypto (sha256Hex, md5Hex, hashBufferHex)
import Rocksky.Lib.Foreign as F
import Rocksky.Scripts.Common (parseInt10)

type Validated = { title :: String, artist :: String, album :: String, albumArtist :: String, durationMs :: Number, discNumber :: Foreign, releaseDate :: Maybe String, hasGainTag :: Boolean }

mimeExtensions :: Object.Object String
mimeExtensions = Object.fromHomogeneous
  { "audio/mpeg": "mp3", "audio/flac": "flac", "audio/mp4": "m4a", "audio/x-m4a": "m4a", "audio/ogg": "ogg", "audio/wav": "wav", "audio/x-wav": "wav", "audio/aiff": "aiff", "audio/x-aiff": "aiff" }
pictureExtensions :: Object.Object String
pictureExtensions = Object.fromHomogeneous { "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/bmp": "bmp", "image/tiff": "tiff" }

detectBytes :: Array Int -> Maybe String
detectBytes bytes = case A.find (\sig -> A.take (A.length sig.bytes) bytes == sig.bytes) signatures of
  Just sig -> Just sig.mime
  Nothing | A.slice 4 8 bytes == [102, 116, 121, 112] -> Just "audio/mp4"
  _ -> Nothing
  where
  signatures =
    [ { bytes: [73, 68, 51], mime: "audio/mpeg" }
    , { bytes: [255, 251], mime: "audio/mpeg" }, { bytes: [255, 243], mime: "audio/mpeg" }, { bytes: [255, 242], mime: "audio/mpeg" }
    , { bytes: [102, 76, 97, 67], mime: "audio/flac" }, { bytes: [79, 103, 103, 83], mime: "audio/ogg" }
    , { bytes: [82, 73, 70, 70], mime: "audio/wav" }, { bytes: [70, 79, 82, 77], mime: "audio/aiff" }
    ]
detectMime :: Buffer -> Effect (Maybe String)
detectMime buf = detectBytes <$> Buffer.toArray (Buffer.slice 0 8 buf)
metaSha256 :: String -> String -> String -> String
metaSha256 title artist album = sha256Hex (S.toLower (title <> " - " <> artist <> " - " <> album))
contentSha256 :: Buffer -> String
contentSha256 = hashBufferHex "sha256"
coverMd5 :: String -> String -> String
coverMd5 artist album = md5Hex (S.toLower (artist <> " - " <> album))

validate :: Foreign -> Either Foreign Validated
validate metadata =
  let raw key = fromMaybe F.undefined (F.path ("common." <> key) metadata)
      trimmed key = S.trim (fromMaybe "" (F.readStringAt ("common." <> key) metadata))
      title = trimmed "title"
      artist = trimmed "artist"
      album = trimmed "album"
      albumArtist = if trimmed "albumartist" /= "" then trimmed "albumartist" else artist
      seconds = fromMaybe 0.0 (F.readNumberAt "format.duration" metadata)
      initialDuration = if F.truthy (F.toForeign seconds) then Number.round (seconds * 1000.0) else 0.0
      native = fromMaybe Object.empty (F.path "native" metadata >>= F.asObject)
      tags = A.concatMap (fromMaybe [] <<< F.asArray) (Object.values native)
      durationMs = if initialDuration < 1.0 then case A.find (\tag -> F.readStringAt "id" tag == Just "TLEN") tags of
        Just tag -> parseInt10 (F.stringValue (fromMaybe F.undefined (F.path "value" tag)))
        Nothing -> initialDuration
        else initialDuration
      check acc { key, max } =
        if trimmed key == "" then A.snoc acc key
        else if CU.length (trimmed key) > max then A.snoc acc (key <> " (too long, max " <> show max <> " chars)")
        else acc
      fields = foldl check [] [{key:"title",max:512},{key:"artist",max:256},{key:"album",max:256}]
      missing = fields <> (if durationMs < 1.0 then ["duration"] else []) <>
        (if A.null (fromMaybe [] (F.readArrayAt "common.picture" metadata)) then ["album art"] else []) <>
        (if CU.length albumArtist > 256 then ["albumArtist (too long, max 256 chars)"] else [])
      disk = raw "disk.no"
      date = case F.path "common.date" metadata of
        Just value -> Just (F.stringValue value)
        Nothing -> F.stringValue <$> F.path "common.originaldate" metadata
      releaseDate = date >>= \d -> if S.contains (S.Pattern "-") d then Just d else Nothing
  in if not (F.truthy (raw "title")) && not (F.truthy (raw "artist")) && not (F.truthy (raw "album")) then Left (F.toForeign
       { error: "NO_TAGS", message: "No audio tags found in this file. Please tag your file before uploading." })
     else if not (A.null missing) then Left (F.toForeign
       { error: "INCOMPLETE_METADATA", message: "Missing required tags: " <> S.joinWith ", " missing <> ". Please tag your file before uploading.", missingFields: missing })
     else Right { title, artist, album, albumArtist, durationMs, discNumber: if F.truthy disk then disk else F.toForeign 1
       , releaseDate, hasGainTag: isJust (F.path "common.replaygain_track_gain.dB" metadata) }
