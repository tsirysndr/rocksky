module Main where

import Prelude (Unit)

import Effect (Effect)
import Rocksky.CI.Go as Jobs

sdk :: Effect Unit
sdk = Jobs.sdkJob

deezer :: Effect Unit
deezer = Jobs.deezerJob

musicbrainz :: Effect Unit
musicbrainz = Jobs.musicbrainzJob
