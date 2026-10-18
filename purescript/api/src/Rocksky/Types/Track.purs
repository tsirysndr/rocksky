-- | The scrobble/now-playing payload (`trackSchema` in src/types/track.ts) and
-- | the MusicBrainz-shaped track passed to teal.fm.
module Rocksky.Types.Track
  ( Track
  , TrackArtist
  , MusicbrainzTrack
  , MusicbrainzArtist
  , parseTrack
  , trackDecoder
  , canonicalText
  , formatValidationError
  ) where

import Prelude

import Data.Either (Either)
import Data.JSDate (JSDate)
import Data.JSDate as JSDate
import Data.Nullable (Nullable)
import Data.String (Pattern(..), Replacement(..), replaceAll)
import Effect.Unsafe (unsafePerformEffect)
import Foreign (Foreign)
import Rocksky.Lib.Validate (Decoder, FieldError, array, field, formatErrors, nonEmpty, number, object, optionalNullablePreserve, regexMatch, run, string, trimmed)

type TrackArtist = { mbid :: Nullable String, name :: String }

type Track =
  { title :: String
  , artist :: String
  , artists :: Nullable (Array TrackArtist)
  , album :: String
  , albumArtist :: String
  , duration :: Number
  , mbId :: Nullable String
  , isrc :: Nullable String
  , albumArt :: Nullable String
  , trackNumber :: Nullable Number
  , releaseDate :: Nullable JSDate
  , year :: Nullable Number
  , discNumber :: Nullable Number
  , lyrics :: Nullable String
  , composer :: Nullable String
  , copyrightMessage :: Nullable String
  , label :: Nullable String
  , artistPicture :: Nullable String
  , spotifyLink :: Nullable String
  , lastfmLink :: Nullable String
  , youtubeLink :: Nullable String
  , tidalLink :: Nullable String
  , appleMusicLink :: Nullable String
  , deezerLink :: Nullable String
  , timestamp :: Nullable Number
  , genres :: Nullable (Array String)
  }

type MusicbrainzArtist = { id :: String, mbid :: String, name :: String }

type MusicbrainzTrack =
  { trackMBID :: String
  , releaseMBID :: String
  , name :: String
  , artist :: Array MusicbrainzArtist
  , album :: String
  , timestamp :: String
  }

-- | Replace the curly right single quotation mark (U+2019) with the ASCII
-- | apostrophe so "Guns N’ Roses" and "Guns N' Roses" collapse to one form.
-- | Mirrors `normalize_text` in crates/mirror/src/track.rs.
canonicalText :: Decoder String
canonicalText = map (replaceAll (Pattern "’") (Replacement "'")) (trimmed (nonEmpty string))

dateString :: Decoder JSDate
dateString = map (\s -> unsafePerformEffect (JSDate.parse s))
  (regexMatch "^\\d{4}-\\d{2}-\\d{2}$" "Invalid date format. Use YYYY-MM-DD." string)

artistDecoder :: Decoder TrackArtist
artistDecoder = object \o -> { mbid: _, name: _ }
  <$> optionalNullablePreserve "mbid" string o
  <*> field "name" canonicalText o

trackDecoder :: Decoder Track
trackDecoder = object \o ->
  { title: _, artist: _, artists: _, album: _, albumArtist: _, duration: _, mbId: _, isrc: _, albumArt: _
  , trackNumber: _, releaseDate: _, year: _, discNumber: _, lyrics: _, composer: _, copyrightMessage: _
  , label: _, artistPicture: _, spotifyLink: _, lastfmLink: _, youtubeLink: _, tidalLink: _, appleMusicLink: _
  , deezerLink: _, timestamp: _, genres: _
  }
    <$> field "title" canonicalText o
    <*> field "artist" canonicalText o
    <*> optionalNullablePreserve "artists" (array artistDecoder) o
    <*> field "album" canonicalText o
    <*> field "albumArtist" canonicalText o
    <*> field "duration" number o
    <*> optionalNullablePreserve "mbId" string o
    <*> optionalNullablePreserve "isrc" string o
    <*> optionalNullablePreserve "albumArt" string o
    <*> optionalNullablePreserve "trackNumber" number o
    <*> optionalNullablePreserve "releaseDate" dateString o
    <*> optionalNullablePreserve "year" number o
    <*> optionalNullablePreserve "discNumber" number o
    <*> optionalNullablePreserve "lyrics" string o
    <*> optionalNullablePreserve "composer" string o
    <*> optionalNullablePreserve "copyrightMessage" string o
    <*> optionalNullablePreserve "label" string o
    <*> optionalNullablePreserve "artistPicture" string o
    <*> optionalNullablePreserve "spotifyLink" string o
    <*> optionalNullablePreserve "lastfmLink" string o
    <*> optionalNullablePreserve "youtubeLink" string o
    <*> optionalNullablePreserve "tidalLink" string o
    <*> optionalNullablePreserve "appleMusicLink" string o
    <*> optionalNullablePreserve "deezerLink" string o
    <*> optionalNullablePreserve "timestamp" number o
    <*> optionalNullablePreserve "genres" (array string) o

parseTrack :: Foreign -> Either (Array FieldError) Track
parseTrack = run trackDecoder

-- | "Invalid scrobble: albumArtist Required; duration Expected number, received string".
formatValidationError :: Array FieldError -> String
formatValidationError es = case es of
  [] -> "Invalid scrobble input."
  _ -> "Invalid scrobble: " <> formatErrors es
