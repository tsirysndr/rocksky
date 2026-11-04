module Main where

import Prelude (Unit)

import Effect (Effect)
import Rocksky.CI.Eas as Jobs

android :: Effect Unit
android = Jobs.androidJob

toolchain :: Effect Unit
toolchain = Jobs.toolchainJob

aab :: Effect Unit
aab = Jobs.aabJob

apk :: Effect Unit
apk = Jobs.apkJob
