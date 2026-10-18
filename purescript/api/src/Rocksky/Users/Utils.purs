module Rocksky.Users.Utils (dedupeTracksKeepLyrics) where

import Prelude
import Data.Maybe (fromMaybe)
import Data.Nullable (Nullable, toMaybe)
import Rocksky.Lib.Common (dedupeByPosition, positionKey)

dedupeTracksKeepLyrics
  :: forall r
   . Array { disc_number :: Nullable Int, track_number :: Nullable Int, lyrics :: Nullable String | r }
  -> Array { disc_number :: Nullable Int, track_number :: Nullable Int, lyrics :: Nullable String | r }
dedupeTracksKeepLyrics = dedupeByPosition
  (\t -> positionKey t.disc_number <> " - " <> positionKey t.track_number)
  (\t -> fromMaybe "" (toMaybe t.lyrics) /= "")
