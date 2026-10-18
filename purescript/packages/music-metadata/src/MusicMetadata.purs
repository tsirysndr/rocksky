-- | Bindings for `music-metadata`: `parseBuffer` with the common tags and
-- | format fields the upload pipeline reads.
module MusicMetadata
  ( ParseOptions
  , Metadata
  , CommonTags
  , Format
  , Picture
  , TrackNumber
  , NativeTag
  , parseBuffer
  , parseUploadBuffer
  ) where

import Control.Promise (Promise, toAffE)
import Data.Nullable (Nullable)
import Effect (Effect)
import Effect.Aff (Aff)
import Foreign (Foreign)
import Foreign.Object (Object)
import Node.Buffer (Buffer)

-- | `mimeType` hints the parser; `duration: true` scans the whole stream
-- | when the headers do not carry a duration.
type ParseOptions = { mimeType :: Nullable String, duration :: Boolean }

type TrackNumber = { no :: Nullable Int, of :: Nullable Int }

-- | The first embedded picture: `format` is its MIME type.
type Picture = { format :: String, data :: Buffer }

-- | `metadata.common` flattened: list-valued tags stay arrays (empty when
-- | absent), `lyrics` is the first unsynchronised lyrics text,
-- | `replaygainTrackGain` is `replaygain_track_gain.dB`.
type CommonTags =
  { title :: Nullable String
  , artist :: Nullable String
  , artists :: Array String
  , album :: Nullable String
  , albumartist :: Nullable String
  , year :: Nullable Int
  , date :: Nullable String
  , originaldate :: Nullable String
  , track :: TrackNumber
  , disk :: TrackNumber
  , genre :: Array String
  , composer :: Array String
  , lyrics :: Nullable String
  , picture :: Nullable Picture
  , copyright :: Nullable String
  , label :: Array String
  , isrc :: Array String
  , musicbrainzTrackid :: Nullable String
  , musicbrainzRecordingid :: Nullable String
  , musicbrainzAlbumid :: Nullable String
  , musicbrainzReleasegroupid :: Nullable String
  , musicbrainzArtistid :: Array String
  , musicbrainzAlbumartistid :: Array String
  , replaygainTrackGain :: Nullable Number
  , replaygainTrackPeak :: Nullable Number
  }

-- | `metadata.format`; `duration` is in seconds, `bitrate` in bits/s.
type Format =
  { duration :: Nullable Number
  , bitrate :: Nullable Number
  , sampleRate :: Nullable Number
  , numberOfChannels :: Nullable Int
  , bitsPerSample :: Nullable Int
  , codec :: Nullable String
  , container :: Nullable String
  , lossless :: Nullable Boolean
  , tagTypes :: Array String
  }

-- | One raw tag of `metadata.native[tagType]` (e.g. ID3v2.3 "TLEN").
type NativeTag = { id :: String, value :: Foreign }

type Metadata =
  { common :: CommonTags
  , format :: Format
  , native :: Object (Array NativeTag)
  }

foreign import parseBufferImpl :: Buffer -> ParseOptions -> Effect (Promise Metadata)

-- | `parseBuffer(buffer, { mimeType }, { duration })`.
parseBuffer :: Buffer -> ParseOptions -> Aff Metadata
parseBuffer b o = toAffE (parseBufferImpl b o)

-- | Raw parser result, preserving the exact upload source invocation.
foreign import parseUploadBufferImpl :: Buffer -> String -> Effect (Promise Foreign)
parseUploadBuffer :: Buffer -> String -> Aff Foreign
parseUploadBuffer b mime = toAffE (parseUploadBufferImpl b mime)
