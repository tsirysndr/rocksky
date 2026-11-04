module Main where

import Prelude
import CI.Docker.Engine as E
import CI.Module as M
import Data.Argonaut.Parser (jsonParser)
import Data.Maybe (Maybe(..))
import Data.Either (Either(..))
import Effect (Effect)
import Effect.Exception (throw)
import FluentCI.Plugin as P
import Foreign.Object (Object)
import Foreign.Object as Object
import Data.Argonaut.Core (Json)
import Rocksky.CI.Host.Install as Install
import Rocksky.CI.Host.Release as Release

input :: Effect (Object Json)
input = do
  raw <- E.unwrap P.input
  case jsonParser (if raw == "" then "{}" else raw) of
    Left problem -> throw problem
    Right value -> M.json value

field :: String -> Object Json -> Effect String
field name fields = case Object.lookup name fields of
  Nothing -> throw ("Missing argument: " <> name)
  Just value -> M.json value

installDagger :: Effect Unit
installDagger = Install.install
resolveTag :: Effect Unit
resolveTag = input >>= field "project" >>= Release.resolveTag
bindings :: Effect Unit
bindings = input >>= field "target" >>= Release.bindings
packageNative :: Effect Unit
packageNative = input >>= field "project" >>= Release.packageNative
upload :: Effect Unit
upload = do
  fields <- input
  directory <- field "directory" fields
  prefix <- field "prefix" fields
  Release.upload directory prefix
stampDesktop :: Effect Unit
stampDesktop = Release.stampDesktop
buildDesktop :: Effect Unit
buildDesktop = Release.buildDesktop
packageDesktop :: Effect Unit
packageDesktop = Release.packageDesktop
