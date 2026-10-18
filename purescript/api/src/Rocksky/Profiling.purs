module Rocksky.Profiling (start) where

import Prelude

import Effect (Effect)
import Pyroscope as Pyroscope

start :: Effect Unit
start = do
  Pyroscope.init { serverAddress: "http://localhost:4040", appName: "rocksky-api" }
  Pyroscope.start
