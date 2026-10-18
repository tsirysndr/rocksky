-- | `src/lib/index.ts`: album-art fallback, track dedupe and key case helpers.
module Rocksky.Lib.Common
  ( defaultAlbumArt
  , withFallbackAlbumArt
  , dedupeByPosition
  , positionKey
  , dedupeTracksKeepLyrics
  , module F
  ) where

import Prelude

import Data.Array (foldl, mapMaybe)
import Data.Map as Map
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Nullable (Nullable, toMaybe)
import Foreign (isUndefined)
import Rocksky.Lib.Foreign (toForeign)
import Rocksky.Lib.Foreign (deepCamelCaseKeys, deepSnakeCaseKeys) as F

-- | Canonical Last.fm "no image" placeholder. Persisted/published in place of
-- | null album art so downstream consumers always see a non-null URL.
defaultAlbumArt :: String
defaultAlbumArt = "https://lastfm.freetls.fastly.net/i/u/300x300/2a96cbd8b46e442fc41c2b86b821562f.png"

withFallbackAlbumArt :: Nullable String -> String
withFallbackAlbumArt url = case toMaybe url of
  Just u -> u
  Nothing -> defaultAlbumArt

-- | One track per (disc, track) position; a later duplicate replaces an
-- | earlier one only when it brings lyrics the earlier one lacks.
dedupeTracksKeepLyrics
  :: forall r
   . Array { discNumber :: Nullable Int, trackNumber :: Nullable Int, lyrics :: Nullable String | r }
  -> Array { discNumber :: Nullable Int, trackNumber :: Nullable Int, lyrics :: Nullable String | r }
dedupeTracksKeepLyrics = dedupeByPosition
  (\t -> positionKey t.discNumber <> " - " <> positionKey t.trackNumber)
  (\t -> fromMaybe "" (toMaybe t.lyrics) /= "")

positionKey :: Nullable Int -> String
positionKey value = if isUndefined (toForeign value) then "undefined" else case toMaybe value of
  Nothing -> "null"
  Just n -> show n

-- JavaScript Map preserves first insertion order even when a value is replaced.
dedupeByPosition :: forall a. (a -> String) -> (a -> Boolean) -> Array a -> Array a
dedupeByPosition key hasLyrics tracks =
  let result = foldl step { order: [], rows: Map.empty } tracks
  in mapMaybe (\k -> Map.lookup k result.rows) result.order
  where
  step state track = case Map.lookup (key track) state.rows of
    Nothing -> { order: state.order <> [key track], rows: Map.insert (key track) track state.rows }
    Just previous
      | not (hasLyrics previous) && hasLyrics track -> state { rows = Map.insert (key track) track state.rows }
      | otherwise -> state
