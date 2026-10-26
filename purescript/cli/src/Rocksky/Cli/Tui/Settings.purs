module Rocksky.Cli.Tui.Settings where

import Prelude
import Data.Array as Array
import Data.Foldable (foldl)
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Number as Number
import Data.String (Pattern(..), joinWith, split, trim)
import Data.String.CodeUnits as CU
import Data.Tuple (Tuple(..))
import Foreign (Foreign)
import Foreign.Object as Object
import Rocksky.Lib.Foreign as F

type Equalizer =
  { enabled :: Boolean
  , bands :: Array Number
  , bass :: Number
  , treble :: Number
  , crossfade :: Number
  , fadeInDelay :: Number
  , fadeInDuration :: Number
  , fadeOutDelay :: Number
  , fadeOutDuration :: Number
  , mixMode :: Number
  , replaygain :: Number
  , replaygainPreamp :: Number
  , replaygainClip :: Boolean
  }

type Settings =
  { volume :: Number
  , shuffle :: Boolean
  , repeat :: String
  , output :: String
  , mpd :: { enabled :: Boolean, port :: Number, bind :: String }
  , remote :: { name :: String }
  , equalizer :: Equalizer
  }

defaultSettings :: Settings
defaultSettings =
  { volume: 0.9
  , shuffle: false
  , repeat: "off"
  , output: ""
  , mpd: { enabled: false, port: 6600.0, bind: "127.0.0.1" }
  , remote: { name: "Rocksky CLI" }
  , equalizer:
      { enabled: false
      , bands: Array.replicate 10 0.0
      , bass: 0.0
      , treble: 0.0
      , crossfade: 5.0
      , fadeInDelay: 0.0
      , fadeInDuration: 6.0
      , fadeOutDelay: 0.0
      , fadeOutDuration: 6.0
      , mixMode: 1.0
      , replaygain: 0.0
      , replaygainPreamp: 0.0
      , replaygainClip: true
      }
  }

parseValue :: String -> Foreign
parseValue value = case value of
  "true" -> F.toForeign true
  "false" -> F.toForeign false
  _ | CU.take 1 value == "[" -> F.toForeign $ map (fromMaybe Number.nan <<< Number.fromString <<< trim) $
    Array.filter (\s -> trim s /= "") (split (Pattern ",") (CU.drop 1 (CU.take (CU.length value - 1) value)))
  _ | CU.take 1 value == "\"" -> F.toForeign (CU.drop 1 (CU.take (CU.length value - 1) value))
  _ -> case Number.fromString value of
    Just number -> F.toForeign number
    Nothing -> F.toForeign value

parseToml :: String -> Object.Object Foreign
parseToml text = (foldl parseLine { section: "", values: Object.empty } (split (Pattern "\n") text)).values
  where
  parseLine state raw =
    let
      line = trim raw
    in
      if line == "" || CU.take 1 line == "#" then state
      else if CU.take 1 line == "[" && CU.drop (CU.length line - 1) line == "]" then state { section = CU.drop 1 (CU.take (CU.length line - 1) line) }
      else case CU.indexOf (Pattern "=") line of
        Nothing -> state
        Just index -> state
          { values = Object.insert
              ((if state.section == "" then "" else state.section <> ".") <> trim (CU.take index line))
              (parseValue (trim (CU.drop (index + 1) line)))
              state.values
          }

parseSettings :: String -> Settings
parseSettings raw =
  let
    values = parseToml raw
    num key fallback = fromMaybe fallback do
      value <- Object.lookup key values >>= F.asNumber
      if Number.isNaN value then Nothing else Just value
    bool key fallback = fromMaybe fallback (Object.lookup key values >>= F.asBoolean)
    str key fallback = fromMaybe fallback (Object.lookup key values >>= F.asString)
    bands = fromMaybe [] (Object.lookup "equalizer.bands" values >>= F.asArray)
    band i = fromMaybe 0.0 do
      value <- Array.index bands i >>= F.asNumber
      if Number.isNaN value then Nothing else Just value
    repeat = str "repeat" "off"
    name = str "remote.name" "Rocksky CLI"
  in
    { volume: num "volume" 0.9
    , shuffle: bool "shuffle" false
    , repeat: if repeat == "one" || repeat == "all" then repeat else "off"
    , output: str "output" ""
    , mpd: { enabled: bool "mpd.enabled" false, port: num "mpd.port" 6600.0, bind: str "mpd.bind" "127.0.0.1" }
    , remote: { name: if trim name == "" then "Rocksky CLI" else name }
    , equalizer:
        { enabled: bool "equalizer.enabled" false
        , bands: map band (Array.range 0 9)
        , bass: num "equalizer.bass" 0.0
        , treble: num "equalizer.treble" 0.0
        , crossfade: num "equalizer.crossfade" 5.0
        , fadeInDelay: num "equalizer.fadeInDelay" 0.0
        , fadeInDuration: num "equalizer.fadeInDuration" 6.0
        , fadeOutDelay: num "equalizer.fadeOutDelay" 0.0
        , fadeOutDuration: num "equalizer.fadeOutDuration" 6.0
        , mixMode: num "equalizer.mixMode" 1.0
        , replaygain: num "equalizer.replaygain" 0.0
        , replaygainPreamp: num "equalizer.replaygainPreamp" 0.0
        , replaygainClip: bool "equalizer.replaygainClip" true
        }
    }

serialize :: Settings -> String
serialize settings = joinWith "\n" $
  fields (F.toForeign { volume: settings.volume, shuffle: settings.shuffle, repeat: settings.repeat, output: settings.output })
    <> [ "", "[mpd]" ]
    <> fields (F.toForeign settings.mpd)
    <> [ "", "[remote]" ]
    <> fields (F.toForeign settings.remote)
    <> [ "", "[equalizer]" ]
    <> fields (F.toForeign settings.equalizer)
    <> [ "" ]
  where
  fields value = map (\(Tuple key item) -> key <> " = " <> F.stringify item) (Object.toUnfoldable (fromMaybe Object.empty (F.asObject value)) :: Array (Tuple String Foreign))
