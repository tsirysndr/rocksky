-- | Does a `tracks` row credit this artist?
-- |
-- | `artist_tracks` is not trustworthy on its own: the write paths resolve the
-- | track and the artist from two separate lookups, and when the track lookup
-- | falls back to MBID/ISRC it can land on a different recording entirely —
-- | leaving rows like (Slipknot, "Baby" by Cannons) behind. The scrobbles stay
-- | correct, so only the junction is wrong, and every read over it needs this
-- | guard. `crates/navidrome` and `crates/jellyfin` already carry one.
-- |
-- | The comparison is containment in *either* direction, never equality,
-- | because neither string is canonical:
-- |
-- |   artists.name             tracks.artist
-- |   "Princess Superstar"  ⊂  "Mason, Princess Superstar"   collaboration
-- |   "Nujabes / fat jon"   ⊃  "fat jon"                     split credit
-- |   "Slipknot"            ⊘  "Cannons"                     stranger
-- |
-- | and it runs on a folded form, because the same artist is spelled several
-- | ways across sources — "JAŸ-Z"/"JAY-Z", "Jóhann Jóhannsson"/"Johann
-- | Johannsson", "8‐Bit"/"8-Bit" (U+2010 against a hyphen). Folding them
-- | together costs nothing; treating them as different artists drops real
-- | tracks off an artist's page.
-- |
-- | Deliberately done here and not in SQL: the database folds case for ASCII
-- | only — `lower('SÄLEN')` comes back as `'sÄlen'`, and `ILIKE` follows the
-- | same rules — so SÄLEN and Sälen would be two artists.
module Rocksky.Lib.Credits
  ( creditsArtist
  , creditsArtistRow
  , fold
  ) where

import Prelude

import Data.Array (any)
import Data.Either (hush)
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Nullable (Nullable, notNull, toMaybe)
import Data.String (Pattern(..), contains, toLower, trim)
import Data.String.Regex (Regex, regex, replace)
import Data.String.Regex.Flags (global, unicode)

foreign import normalizeNFKD :: String -> String

creditsArtist :: Nullable String -> { artist :: Nullable String, albumArtist :: Nullable String } -> Boolean
creditsArtist artistName track =
  let
    name = fold (fromMaybe "" (toMaybe artistName))
  in
    if name == "" then false
    else any (credited name) [ track.artist, track.albumArtist ]
  where
  credited name c =
    let
      other = fold (fromMaybe "" (toMaybe c))
    in
      other /= "" && (contains (Pattern name) other || contains (Pattern other) name)

-- | The same guard over a `tracks` row, whose credits are never null.
creditsArtistRow :: forall r. Nullable String -> { artist :: String, albumArtist :: String | r } -> Boolean
creditsArtistRow artistName track =
  creditsArtist artistName { artist: notNull track.artist, albumArtist: notNull track.albumArtist }

marks :: Maybe Regex
marks = hush (regex "\\p{M}" (global <> unicode))

dashes :: Maybe Regex
dashes = hush (regex "[‐-―−]" global)

singleQuotes :: Maybe Regex
singleQuotes = hush (regex "[‘’ʼ]" global)

doubleQuotes :: Maybe Regex
doubleQuotes = hush (regex "[“”]" global)

spaces :: Maybe Regex
spaces = hush (regex "\\s+" global)

replaceWith :: Maybe Regex -> String -> String -> String
replaceWith re repl s = case re of
  Just r -> replace r repl s
  Nothing -> s

-- | Lowercased, without diacritics, with typographic punctuation flattened.
fold :: String -> String
fold value =
  normalizeNFKD value
    # replaceWith marks ""
    # replaceWith dashes "-"
    # replaceWith singleQuotes "'"
    # replaceWith doubleQuotes "\""
    # replaceWith spaces " "
    # trim
    # toLower
