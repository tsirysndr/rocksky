module Rocksky.Lib.RecordPosition (recordPosition) where

import Prelude

import Data.Int (fromNumber)
import Data.Maybe (Maybe(..))
import Data.Nullable (Nullable, toMaybe)

-- | Track/disc positions in published records must be positive integers.
-- | Clients and catalog providers sometimes use zero to mean unknown.
-- | Normalize at publication so already-queued submissions are repaired too.
recordPosition :: Nullable Number -> Int
recordPosition value = case toMaybe value >>= fromNumber of
  Just n | n >= 1 -> n
  _ -> 1
