module Rocksky.Cli.Native.Nfc where

import Prelude
import Data.Array as Array
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Nullable (Nullable, toNullable)
import Data.String (Pattern(..), joinWith, split, toLower, trim)
import Data.String.CodeUnits as CU
import Foreign (Foreign)
import JSURI (decodeURIComponent, encodeURIComponent)
import Rocksky.Cli.Client (field)
import Rocksky.Lib.Foreign as F

payloadsFor :: String -> Foreign -> Array String
payloadsFor kind reference = Array.filter (_ /= "")
  [ trim (field "uri" reference), if trim (field "id" reference) == "" then "" else "rocksky://library/" <> kind <> "/" <> trim (field "id" reference) ]

favoritesPayloads :: String -> Array String
favoritesPayloads did = if trim did == "" then [] else [ "rocksky://favorites/" <> fromMaybe "" (encodeURIComponent (trim did)) ]

parsePayload :: String -> Nullable Foreign
parsePayload payload = toNullable do
  let
    value = trim payload
    parts = split (Pattern "/") value
  case parts of
    [ scheme, "", authority, collection, key ]
      | toLower scheme == "at:" && authority /= "" && key /= "" && Array.elem (toLower collection) [ "app.rocksky.album", "app.rocksky.playlist" ] ->
          Just $ F.toForeign { kind: if toLower collection == "app.rocksky.album" then "albumUri" else "playlistUri", uri: value }
    _ | CU.take 18 (toLower value) == "rocksky://library/" -> do
      let rest = Array.drop 3 parts
      kind <- Array.head rest
      let encoded = joinWith "/" (Array.drop 1 rest)
      if Array.elem (toLower kind) [ "album", "playlist" ] && encoded /= "" then do
        id <- decodeURIComponent encoded
        pure $ F.toForeign { kind: toLower kind, id }
      else Nothing
    _ | CU.take 20 (toLower value) == "rocksky://favorites/" && CU.length value > 20 -> do
      did <- decodeURIComponent (CU.drop 20 value)
      pure $ F.toForeign { kind: "favorites", did }
    _ -> Nothing
