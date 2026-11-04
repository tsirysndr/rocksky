module Main where

import Prelude (Unit)

import Effect (Effect)
import Rocksky.CI.Artifacts as Jobs

archive :: Effect Unit
archive = Jobs.archiveJob

checksums :: Effect Unit
checksums = Jobs.checksumsJob

binary :: Effect Unit
binary = Jobs.binaryJob
