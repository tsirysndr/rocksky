module Rocksky.Cli.Runtime where

import Prelude
import Control.Promise (Promise, toAffE)
import Effect (Effect)
import Effect.Aff (Aff)
import Foreign (Foreign)

foreign import args :: Effect (Array String)
foreign import env :: String -> Effect String
foreign import print :: String -> Effect Unit
foreign import printError :: String -> Effect Unit
foreign import setExitCode :: Int -> Effect Unit
foreign import loadToken :: Effect String
foreign import readStateImpl :: String -> Effect (Promise String)
foreign import writeStateImpl :: String -> String -> Effect (Promise Unit)
foreign import loadEnvironment :: Effect Unit
foreign import statusText :: Foreign -> String
foreign import relativeTime :: String -> Effect String
foreign import style :: String -> String -> String
foreign import initializeDatabaseImpl :: Effect (Promise Unit)
foreign import invokeImpl :: String -> Array Foreign -> Effect (Promise Unit)
foreign import openBrowserImpl :: String -> Effect (Promise Unit)

readState :: String -> Aff String
readState name = toAffE (readStateImpl name)

writeState :: String -> String -> Aff Unit
writeState name content = toAffE (writeStateImpl name content)

initializeDatabase :: Aff Unit
initializeDatabase = toAffE initializeDatabaseImpl

invoke :: String -> Array Foreign -> Aff Unit
invoke name arguments = toAffE (invokeImpl name arguments)

openBrowser :: String -> Aff Unit
openBrowser url = toAffE (openBrowserImpl url)

foreign import nowSeconds :: Effect Number

foreign import exit :: Int -> Effect Unit
