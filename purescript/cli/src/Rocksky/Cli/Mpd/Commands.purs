module Rocksky.Cli.Mpd.Commands where

import Prelude
import Control.Alt ((<|>))
import Data.Array as Array
import Data.Int as Int
import Data.Maybe (fromMaybe, isJust)
import Data.Number as Number
import Foreign (Foreign)
import Rocksky.Cli.Client as Client
import Rocksky.Cli.Mpd.Protocol (kv)
import Rocksky.Lib.Foreign as F

finiteMs :: Number -> Number
finiteMs value = if Number.isFinite value && value >= 0.0 then value else 0.0

mpdVolume :: Number -> Int
mpdVolume value = if Number.isFinite value then max 0 (min 100 (Int.round (value * 100.0))) else 0

boolArg :: String -> Boolean -> Boolean
boolArg value current = case value of
  "1" -> true
  "0" -> false
  _ -> current

foreign import fixed3 :: Number -> String

statusLines :: Foreign -> Foreign -> Array Foreign -> Number -> Int -> Boolean -> Int -> Array String
statusLines status restored items volume repeat shuffle version =
  let
    stopped = F.isNullish status || Client.field "state" status == "stopped"
    restoredPaused = stopped && not (F.isNullish restored)
    state = if restoredPaused then "pause" else if stopped then "stop" else if Client.field "state" status == "playing" then "play" else "pause"
    index = if not stopped && isJust (F.readIntAt "index" status) then F.readIntAt "index" status else F.readIntAt "index" restored
    base =
      [ kv "volume" (show (mpdVolume volume))
      , kv "repeat" (if repeat /= 0 then "1" else "0")
      , kv "random" (if shuffle then "1" else "0")
      , kv "single" (if repeat == 1 then "1" else "0")
      , kv "consume" "0"
      , kv "playlist" (show version)
      , kv "playlistlength" (show (Array.length items))
      , kv "state" state
      ]
    song = fromMaybe [] do
      position <- index
      item <- Array.index items position
      let
        elapsed = finiteMs $ fromMaybe 0.0 (F.readNumberAt (if restoredPaused then "positionMs" else "position_ms") (if restoredPaused then restored else status))
        duration = finiteMs $ fromMaybe 0.0 $
          if restoredPaused then F.readNumberAt "duration" item
          else F.readNumberAt "duration_ms" status <|> F.readNumberAt "duration" item
      pure $ [ kv "song" (show position), kv "songid" (show position) ] <>
        if state == "stop" then []
        else
          [ kv "time" (show (Int.floor (elapsed / 1000.0)) <> ":" <> show (Int.round (duration / 1000.0)))
          , kv "elapsed" (fixed3 (elapsed / 1000.0))
          ] <>
            if duration > 0.0 then [ kv "duration" (fixed3 (duration / 1000.0)) ] else []
  in
    base <> song
