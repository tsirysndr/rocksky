module Main where

import Prelude (Unit)

import Effect (Effect)
import Rocksky.CI.AndroidSdk as Jobs

container :: Effect Unit
container = Jobs.containerJob
