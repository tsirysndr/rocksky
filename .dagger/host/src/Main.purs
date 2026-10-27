module Main where

import Prelude
import Effect (Effect)
import Effect.Exception (throw)
import Host.System as S
import Host.Install as Install
import Host.Release as Release

main :: Effect Unit
main = do
  arguments <- S.args
  case arguments of
    [ "install-dagger" ] -> Install.install
    [ "resolve-tag", project ] -> Release.resolveTag project
    [ "bindings", target ] -> Release.bindings target
    [ "package-native", project ] -> Release.packageNative project
    [ "upload", directory, prefix ] -> Release.upload directory prefix
    [ "stamp-desktop" ] -> Release.stampDesktop
    [ "build-desktop" ] -> Release.buildDesktop
    [ "package-desktop" ] -> Release.packageDesktop
    _ -> throw "Unknown PureScript CI command"
