module Main where

import Prelude (Unit)

import Effect (Effect)
import Rocksky.CI.Typescript as Jobs

sdk :: Effect Unit
sdk = Jobs.sdkJob

cli :: Effect Unit
cli = Jobs.cliJob

apiContracts :: Effect Unit
apiContracts = Jobs.apiContractsJob
