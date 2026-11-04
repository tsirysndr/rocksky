module Main where

import Prelude (Unit)

import Effect (Effect)
import Rocksky.CI.GithubRelease as Jobs

upload :: Effect Unit
upload = Jobs.uploadJob

ensure :: Effect Unit
ensure = Jobs.ensureJob
