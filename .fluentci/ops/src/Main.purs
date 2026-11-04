module Main where

import Prelude (Unit)

import Effect (Effect)
import Rocksky.CI.Ops as Jobs

publishPostgres :: Effect Unit
publishPostgres = Jobs.publishPostgresJob

uploadRelease :: Effect Unit
uploadRelease = Jobs.uploadReleaseJob

ensureRelease :: Effect Unit
ensureRelease = Jobs.ensureReleaseJob

packageRelease :: Effect Unit
packageRelease = Jobs.packageReleaseJob

desktopRelease :: Effect Unit
desktopRelease = Jobs.desktopReleaseJob

deploy :: Effect Unit
deploy = Jobs.deployJob

nixBuild :: Effect Unit
nixBuild = Jobs.nixBuildJob
