module Fetch.URL (Parts, parse, URL, create, resolve, protocol, pathname, search, setParam, serialize) where

import Prelude
import Effect (Effect)
import Data.Maybe (Maybe)
import Data.Nullable (Nullable, toMaybe)

type Parts = { hostname :: String, pathname :: String }
foreign import parseImpl :: String -> Nullable Parts
parse :: String -> Maybe Parts
parse = toMaybe <<< parseImpl

foreign import data URL :: Type
foreign import create :: String -> Effect URL
foreign import protocol :: URL -> String
foreign import pathname :: URL -> String
foreign import search :: URL -> String
foreign import setParam :: URL -> String -> String -> Effect Unit
foreign import serialize :: URL -> Effect String

-- | new URL(path, base).
foreign import resolve :: String -> String -> Effect URL
