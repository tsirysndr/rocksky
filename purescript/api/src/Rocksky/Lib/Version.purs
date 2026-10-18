-- | The service version reported in telemetry: `package.json`'s `version`.
module Rocksky.Lib.Version (version) where

import Prelude

import Data.Either (Either(..))
import Data.Maybe (fromMaybe)
import Effect.Exception (catchException)
import Effect.Unsafe (unsafePerformEffect)
import Node.Encoding (Encoding(..))
import Node.FS.Sync (readTextFile)
import Rocksky.Lib.Foreign (parseJson, readStringAt)

version :: String
version = unsafePerformEffect $ catchException (\_ -> pure "0.0.0") do
  txt <- readTextFile UTF8 "package.json"
  pure case parseJson txt of
    Right v -> fromMaybe "0.0.0" (readStringAt "version" v)
    Left _ -> "0.0.0"
