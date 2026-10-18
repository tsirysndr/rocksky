module Rocksky.Subscribers.Playback (remainingPlaybackMs) where

import Prelude
import Data.Maybe (Maybe(..))
import Data.Nullable (Nullable, toMaybe)

remainingPlaybackMs :: Nullable { startedAt :: Number, durationMs :: Number } -> Number -> Number
remainingPlaybackMs value now = case toMaybe value of
  Just last | last.durationMs /= 0.0 -> max 0.0 (last.startedAt + last.durationMs - now)
  _ -> 0.0
