module Main where

import Prelude (Unit)

import Effect (Effect)
import Rocksky.CI.Elixir as Jobs

remoteWs :: Effect Unit
remoteWs = Jobs.remoteWsJob
