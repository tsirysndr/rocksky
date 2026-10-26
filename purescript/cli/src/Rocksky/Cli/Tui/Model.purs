module Rocksky.Cli.Tui.Model where

import Prelude
import Data.Array as Array
import Data.Int as Int
import Data.Maybe (Maybe(..), fromMaybe, isNothing)
import Data.Nullable (Nullable, null, toNullable)
import Data.String (Pattern(..), Replacement(..), split, replace)
import Foreign (Foreign)
import Rocksky.Lib.Foreign as F

type ScrobbleState = { key :: String, scrobbled :: Boolean }
type ScrobbleDecision = { state :: ScrobbleState, submit :: Boolean }

initialScrobbleState :: ScrobbleState
initialScrobbleState = { key: "", scrobbled: false }

scrobbleTick :: ScrobbleState -> String -> Foreign -> Foreign -> ScrobbleDecision
scrobbleTick previous token status item =
  if F.isNullish status || fromMaybe "" (F.readStringAt "state" status) == "stopped" || isNothing (F.path "index" status) then
    { state: initialScrobbleState, submit: false }
  else if F.isNullish item then { state: previous, submit: false }
  else
    let
      key = fromMaybe "" (F.path "index" status <#> F.stringValue) <> ":" <> fromMaybe "" (F.readStringAt "uploadId" item)
      state = if previous.key == key then previous else { key, scrobbled: false }
      duration = case F.readNumberAt "duration_ms" status of
        Just value | value /= 0.0 -> value
        _ -> fromMaybe 0.0 (F.readNumberAt "duration" item)
      position = fromMaybe 0.0 (F.readNumberAt "position_ms" status)
      submit = not state.scrobbled && token /= "" && duration >= 30000.0 && position >= min (duration / 2.0) 240000.0
    in
      { state: state { scrobbled = state.scrobbled || submit }, submit }

fmtDuration :: Number -> String
fmtDuration ms =
  if ms <= 0.0 then ""
  else
    let
      seconds = Int.floor (ms / 1000.0)
      remaining = mod seconds 60
    in
      show (div seconds 60) <> ":" <> (if remaining < 10 then "0" else "") <> show remaining

rockskyLink :: String -> String
rockskyLink uri = case Array.index (split (Pattern "at://") uri) 1 of
  Just rest | rest /= "" -> "https://rocksky.app/" <> replace (Pattern "app.rocksky.") (Replacement "") rest
  _ -> ""

type Session = { queue :: Array Foreign, index :: Number, positionMs :: Number }

session :: Foreign -> Nullable Session
session value = case F.readArrayAt "queue" value of
  Just queue | not (Array.null queue) -> toNullable $ Just
    { queue, index: fromMaybe 0.0 (F.readNumberAt "index" value), positionMs: fromMaybe 0.0 (F.readNumberAt "positionMs" value) }
  _ -> null
