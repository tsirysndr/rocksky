module Rocksky.Import.Parser (parseCSVLine, parseLastfmCsv, parseSpotifyJson) where

import Prelude
import Data.Array as A
import Data.Traversable (traverse)
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Number as Number
import Data.Nullable as N
import Data.String (Pattern(..), split, trim, toLower)
import Data.String.CodeUnits as CU
import Dayjs as Dayjs
import Effect (Effect)
import Effect.Exception (throw)
import Foreign (Foreign)
import Foreign.Object as Object
import Rocksky.Lib.Foreign as F
import Rocksky.Types.Track (Track)

parseCSVLine :: String -> Array String
parseCSVLine line = go 0 false "" []
  where
  go i quoted current fields = case CU.charAt i line of
    Nothing -> A.snoc fields (trim current)
    Just '"' | quoted && CU.charAt (i + 1) line == Just '"' -> go (i + 2) quoted (current <> "\"") fields
    Just '"' -> go (i + 1) (not quoted) current fields
    Just ',' | not quoted -> go (i + 1) quoted "" (A.snoc fields (trim current))
    Just c -> go (i + 1) quoted (current <> CU.singleton c) fields

-- parseInt(..., 10) accepts a numeric prefix and timestamps beyond Int32.
parseTimestamp :: String -> Maybe Number
parseTimestamp raw =
  let
    s = trim raw
    sign = if CU.take 1 s == "-" then -1.0 else 1.0
    body = if CU.take 1 s == "-" || CU.take 1 s == "+" then CU.drop 1 s else s
    digits = CU.fromCharArray (A.takeWhile (\c -> c >= '0' && c <= '9') (CU.toCharArray body))
  in map (_ * sign) (Number.fromString digits)

parseLastfmCsv :: String -> Array Track
parseLastfmCsv raw = A.mapMaybe parseLine (A.drop (if header then 1 else 0) lines)
  where
  lines = split (Pattern "\n") (if CU.take 1 raw == "\xfeff" then CU.drop 1 raw else raw)
  first = parseCSVLine (trim (fromMaybe "" (A.head lines)))
  header = map toLower (A.head first) == Just "uts"
  col name fallback = if header then fromMaybe (-1) (A.elemIndex name first) else fallback
  parseLine line = do
    let fields = parseCSVLine (trim line)
    if A.length fields < 7 then Nothing else do
      title <- A.index fields (col "track" 6)
      artist <- A.index fields (col "artist" 2)
      timestamp <- A.index fields (col "uts" 0) >>= parseTimestamp
      if title == "" || artist == "" || timestamp == 0.0 then Nothing else
        Just (F.unsafeFromForeign (F.toForeign
          { title, artist, albumArtist: artist
          , album: nonempty "Unknown Album" (A.index fields (col "album" 4))
          , duration: 0.0, timestamp
          , mbId: maybeForeign (A.index fields (col "track_mbid" 7))
          }))

nonempty :: String -> Maybe String -> String
nonempty fallback = case _ of
  Just s | s /= "" -> s
  _ -> fallback

maybeForeign :: Maybe String -> Foreign
maybeForeign = case _ of
  Just s | s /= "" -> F.toForeign s
  _ -> F.undefined

parseSpotifyJson :: Foreign -> Effect (Array Track)
parseSpotifyJson input = case F.asArray input of
  Nothing -> pure []
  Just items -> A.catMaybes <$> traverse parseItem items
  where
  parseItem item = case F.asObject item of
    Nothing -> throw "Cannot use 'in' operator to search for 'master_metadata_track_name'"
    Just obj ->
      if Object.member "master_metadata_track_name" obj then parseEntry true item
      else if Object.member "trackName" obj then parseEntry false item
      else pure Nothing
  parseEntry extended item = do
    let
      title = nonempty "" (F.readStringAt (if extended then "master_metadata_track_name" else "trackName") item)
      artist = nonempty "" (F.readStringAt (if extended then "master_metadata_album_artist_name" else "artistName") item)
      duration = fromMaybe 0.0 (F.readNumberAt (if extended then "ms_played" else "msPlayed") item)
    if title == "" || artist == "" || duration < 30000.0 then pure Nothing else do
      let date = fromMaybe F.undefined (F.asObject item >>= Object.lookup (if extended then "ts" else "endTime"))
      ts <- Dayjs.utcInput date (if extended then N.null else N.notNull "YYYY-MM-DD HH:mm")
      let
        spotifyId = F.readStringAt "spotify_track_uri" item >>= A.last <<< split (Pattern ":")
        link = if extended then map ("https://open.spotify.com/track/" <> _) (spotifyId >>= \s -> if s == "" then Nothing else Just s) else Nothing
      pure if not (Dayjs.isValid ts) then Nothing else Just (F.unsafeFromForeign (F.toForeign
        { title, artist, albumArtist: artist, duration, timestamp: Dayjs.toUnix ts
        , album: if extended then nonempty "Unknown Album" (F.readStringAt "master_metadata_album_album_name" item) else "Unknown Album"
        , spotifyLink: maybeForeign link
        }))
