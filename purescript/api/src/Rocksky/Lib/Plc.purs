module Rocksky.Lib.Plc (plcDirectoryUrl) where

import Prelude

import Data.Maybe (fromMaybe)
import Effect.Unsafe (unsafePerformEffect)
import Node.Process (lookupEnv)

plcDirectoryUrl :: String
plcDirectoryUrl = unsafePerformEffect do
  v <- lookupEnv "PLC_DIRECTORY_URL"
  pure (fromMaybe "https://plc.directory" (v >>= \s -> if s == "" then pure "https://plc.directory" else pure s))
