module Main where

import Prelude (Unit)

import Effect (Effect)
import Rocksky.CI.Rust as Jobs

sdk :: Effect Unit
sdk = Jobs.sdkJob

tracklist :: Effect Unit
tracklist = Jobs.tracklistJob

matching :: Effect Unit
matching = Jobs.matchingJob

submissions :: Effect Unit
submissions = Jobs.submissionsJob

riff :: Effect Unit
riff = Jobs.riffJob

productionBinaries :: Effect Unit
productionBinaries = Jobs.productionBinariesJob

rockskyd :: Effect Unit
rockskyd = Jobs.rockskydJob

mcpRelease :: Effect Unit
mcpRelease = Jobs.mcpReleaseJob

playerdRelease :: Effect Unit
playerdRelease = Jobs.playerdReleaseJob

bindingsRelease :: Effect Unit
bindingsRelease = Jobs.bindingsReleaseJob
