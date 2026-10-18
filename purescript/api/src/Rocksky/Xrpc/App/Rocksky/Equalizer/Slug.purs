module Rocksky.Xrpc.App.Rocksky.Equalizer.Slug (presetRkey) where

import Prelude
import Data.Either (Either(..))
import Data.String (trim, toLower)
import Data.String.Regex (regex, replace)
import Data.String.Regex.Flags (global)

presetRkey :: String -> String
presetRkey = trim >>> toLower >>> sub "[\\s_]+" "-" >>> sub "[^a-z0-9.-]" "" >>> sub "-{2,}" "-" >>> sub "^-+|-+$" ""
  where
  sub pattern replacement input = case regex pattern global of
    Right re -> replace re replacement input
    Left _ -> input
