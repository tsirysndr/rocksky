module Rocksky.Cli.Import.Parsers where

import Prelude
import Control.Alt ((<|>))
import Data.Array as Array
import Data.Either (Either(..))
import Data.Foldable (foldl)
import Data.Traversable (traverse)
import Data.Int as Int
import Data.List (List(..))
import Data.List as List
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Nullable (Nullable, null, toMaybe, toNullable)
import Data.Number as Number
import Data.Set as Set
import Data.String (Pattern(..), contains, joinWith, split, toLower, trim)
import Data.String.CodeUnits as CU
import Effect (Effect)
import Effect.Exception (throw)
import Foreign (Foreign, isArray)
import Foreign.Object as Object
import Rocksky.Lib.Foreign as F

type Scrobble =
  { title :: String
  , artist :: String
  , album :: Nullable String
  , albumArtist :: Nullable String
  , mbId :: Nullable String
  , isrc :: Nullable String
  , timestamp :: Number
  , msPlayed :: Nullable Number
  , source :: String
  }

type ParseResult = { format :: String, scrobbles :: Array Scrobble, files :: Array String, skipped :: Object.Object Int }
type Options = { force :: Nullable String, minSeconds :: Nullable Number }

foreign import stat :: String -> Effect { exists :: Boolean, directory :: Boolean }
foreign import readFile :: String -> Effect String
foreign import readHead :: String -> Int -> Effect String
foreign import readDirectory :: String -> Effect (Array String)
foreign import joinPath :: String -> String -> String
foreign import extension :: String -> String
foreign import timestamp :: String -> Number
foreign import parseInteger :: String -> Number

parseCsv :: String -> Array (Array String)
parseCsv input = go 0 false "" Nil Nil
  where
  at = flip CU.charAt input
  rowArray field cells = Array.fromFoldable (List.reverse (Cons field cells))
  go i quoted field cells rows = case at i of
    Nothing -> Array.fromFoldable $ List.reverse $
      if field /= "" || not (List.null cells) then Cons (rowArray field cells) rows else rows
    Just char
      | quoted && char == '"' && at (i + 1) == Just '"' -> go (i + 2) true (field <> "\"") cells rows
      | quoted && char == '"' -> go (i + 1) false field cells rows
      | quoted -> go (i + 1) true (field <> CU.singleton char) cells rows
      | char == '"' -> go (i + 1) true field cells rows
      | char == ',' -> go (i + 1) false "" (Cons field cells) rows
      | char == '\n' -> go (i + 1) false "" Nil (Cons (rowArray field cells) rows)
      | char == '\r' -> go (i + 1) false field cells rows
      | otherwise -> go (i + 1) false (field <> CU.singleton char) cells rows

has :: String -> String -> Boolean
has part = contains (Pattern part)

jsonLike :: String -> String -> Boolean
jsonLike file raw = extension file == ".json" || CU.take 1 (trim raw) == "[" || CU.take 1 (trim raw) == "{"

detectFormat :: String -> Effect String
detectFormat file = do
  head <- readHead file 65536
  if extension file /= ".csv" && jsonLike file head then
    pure $ if has "master_metadata_track_name" head || has "spotify_track_uri" head || (has "\"ts\"" head && has "\"ms_played\"" head) then "spotify" else "lastfm"
  else do
    let header = toLower (fromMaybe "" (Array.head (split (Pattern "\n") head)))
    if has "uts" header || (has "track" header && has "artist" header) then pure "lastfm"
    else if has "master_metadata_track_name" header || has "spotify_track_uri" header then pure "spotify"
    else throw "Could not autodetect import format. Pass --format spotify|lastfm."

parseJson :: String -> Effect Foreign
parseJson text = case F.parseJson text of
  Left message -> throw message
  Right value -> pure value

parseImport :: String -> Options -> Effect ParseResult
parseImport target options = do
  info <- stat target
  unless info.exists $ throw ("No such file or directory: " <> target)
  if info.directory then do
    names <- readDirectory target
    let files = map (joinPath target) $ Array.sort $ Array.filter (\name -> has "streaming_history_audio_" (toLower name) && CU.take 24 (toLower name) == "streaming_history_audio_" && extension name == ".json") names
    when (Array.null files) $ throw ("No Spotify \"Streaming_History_Audio_*.json\" files found in " <> target)
    parseSpotifyFiles files (fromMaybe 30.0 (toMaybe options.minSeconds))
  else do
    format <- case toMaybe options.force of
      Nothing -> detectFormat target
      Just forced -> pure forced
    case format of
      "spotify" -> parseSpotifyFiles [ target ] (fromMaybe 30.0 (toMaybe options.minSeconds))
      "lastfm" -> do
        raw <- readFile target
        if jsonLike target raw then parseLastfmJson target raw else parseLastfmCsv target raw
      _ -> throw ("Unsupported import format: " <> format)

emptyScrobble :: String -> String -> String -> Number -> Scrobble
emptyScrobble source title artist time = { title, artist, album: null, albumArtist: null, mbId: null, isrc: null, timestamp: time, msPlayed: null, source }

nonempty :: String -> Nullable String
nonempty value = toNullable $ if value == "" then Nothing else Just value

stringAt :: String -> Foreign -> String
stringAt key = fromMaybe "" <<< F.readStringAt key

finalize :: String -> Array String -> Array (Either String Scrobble) -> ParseResult
finalize format files parsed =
  let
    collected = foldl
      ( \acc item -> case item of
          Left reason -> acc { skipped = Object.insert reason (1 + fromMaybe 0 (Object.lookup reason acc.skipped)) acc.skipped }
          Right scrobble -> acc { records = Cons scrobble acc.records }
      )
      { skipped: Object.empty, records: Nil }
      parsed
    sorted = Array.sortWith _.timestamp (Array.fromFoldable (List.reverse collected.records))
    deduped = foldl
      ( \acc scrobble ->
          let
            key = show scrobble.timestamp <> "|" <> toLower scrobble.title <> "|" <> toLower scrobble.artist
          in
            if Set.member key acc.seen then acc { duplicates = acc.duplicates + 1 }
            else acc { seen = Set.insert key acc.seen, records = Cons scrobble acc.records }
      )
      { seen: Set.empty, duplicates: 0, records: Nil }
      sorted
  in
    { format
    , files
    , scrobbles: Array.fromFoldable (List.reverse deduped.records)
    , skipped: if deduped.duplicates == 0 then collected.skipped else Object.insert "duplicate-in-file" deduped.duplicates collected.skipped
    }

parseSpotifyFiles :: Array String -> Number -> Effect ParseResult
parseSpotifyFiles files minSeconds = do
  parsed <- traverse
    ( \file -> do
        raw <- readFile file >>= parseJson
        unless (isArray raw) $ throw ("Expected a JSON array in " <> file)
        pure $ map parse (fromMaybe [] (F.asArray raw))
    )
    files
  pure $ finalize "spotify" files (Array.concat parsed)
  where
  parse entry =
    let
      title = stringAt "master_metadata_track_name" entry
      artist = stringAt "master_metadata_album_artist_name" entry
      ms = fromMaybe 0.0 (F.readNumberAt "ms_played" entry)
      time = timestamp (stringAt "ts" entry)
      seconds = fromMaybe (show minSeconds) (Int.fromNumber minSeconds <#> show)
    in
      if title == "" || artist == "" then Left "not-a-track"
      else if ms < max 0.0 minSeconds * 1000.0 then Left ("played-under-" <> seconds <> "s")
      else if not (Number.isFinite time) then Left "bad-timestamp"
      else Right $ (emptyScrobble "spotify" title artist time)
        { album = toNullable (F.readStringAt "master_metadata_album_album_name" entry), msPlayed = toNullable (F.readNumberAt "ms_played" entry) }

parseLastfmCsv :: String -> String -> Effect ParseResult
parseLastfmCsv file raw = case Array.uncons (parseCsv raw) of
  Nothing -> pure $ finalize "lastfm" [ file ] []
  Just { head, tail } -> do
    let header = map (toLower <<< trim) head
    unless (Array.elem "track" header && Array.elem "artist" header) $ throw ("Unrecognized Last.fm CSV header in " <> file <> ": " <> joinWith "," header)
    let
      cell row key = trim $ fromMaybe "" (Array.elemIndex key header >>= Array.index row)
      parse row =
        let
          title = cell row "track"
          artist = cell row "artist"
          time = parseInteger (cell row "uts")
        in
          if title == "" || artist == "" then Left "missing-title-or-artist"
          else if not (Number.isFinite time) || time <= 0.0 then Left "bad-timestamp"
          else Right $ (emptyScrobble "lastfm" title artist time) { album = nonempty (cell row "album"), mbId = nonempty (cell row "track_mbid") }
    pure $ finalize "lastfm" [ file ] (map parse tail)

firstValue :: Array String -> Foreign -> Foreign
firstValue paths record = fromMaybe F.undefined $ Array.head $ Array.mapMaybe (flip F.path record) paths

lastfmText :: Foreign -> String
lastfmText value = fromMaybe (stringAt "#text" value <> if stringAt "#text" value == "" then stringAt "name" value else "") (F.asString value)

parseLastfmJson :: String -> String -> Effect ParseResult
parseLastfmJson file raw = do
  parsed <- parseJson raw
  let list = fromMaybe [] $ F.asArray $ if isArray parsed then parsed else firstValue [ "recenttracks.track", "track", "scrobbles" ] parsed
  pure $ finalize "lastfm" [ file ] (map parse list)
  where
  parse entry =
    let
      title = trim $ lastfmText $ firstValue [ "name", "track", "title" ] entry
      artist = trim $ lastfmText $ firstValue [ "artist" ] entry
      time = parseInteger $ F.stringValue $ firstValue [ "date.uts", "date", "uts", "timestamp" ] entry
      album = trim $ lastfmText $ firstValue [ "album" ] entry
      mbid = trim $ fromMaybe "" ((F.path "mbid" entry <|> F.path "track_mbid" entry) <#> F.stringValue)
    in
      if stringAt "@attr.nowplaying" entry == "true" then Left "now-playing"
      else if title == "" || artist == "" then Left "missing-title-or-artist"
      else if not (Number.isFinite time) || time <= 0.0 then Left "bad-timestamp"
      else Right $ (emptyScrobble "lastfm" title artist time) { album = nonempty album, mbId = nonempty mbid }
