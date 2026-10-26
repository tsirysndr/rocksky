module Rocksky.Cli.Index (main, dispatch) where

import Prelude
import Data.Array (index, null)
import Data.Maybe (fromMaybe)
import Effect (Effect)
import Effect.Aff (Aff, catchError, launchAff_)
import Effect.Class (liftEffect)
import Effect.Exception (message)
import Rocksky.Cli.Command.Auth as Auth
import Rocksky.Cli.Command.Import as Import
import Rocksky.Cli.Command.Sync as Sync
import Rocksky.Cli.Command.Scrobble as Scrobble
import Rocksky.Cli.Command.Reads as Reads
import Rocksky.Cli.Commands as Commands
import Rocksky.Cli.Native.Integrations as Native
import Rocksky.Cli.Parser as Parser
import Rocksky.Cli.Runtime as Runtime
import Rocksky.Lib.Foreign as F

main :: Effect Unit
main = do
  Runtime.loadEnvironment
  launchAff_ $ catchError run \err -> liftEffect do
    Runtime.printError ("rocksky: " <> message err)
    Runtime.setExitCode 1
  where
  run = do
    arguments <- liftEffect Runtime.args
    if null arguments then Native.tui (F.toForeign {})
    else Parser.parse Commands.version Commands.specs dispatch

dispatch :: Parser.Invocation -> Aff Unit
dispatch invocation = case invocation.command of
  "albums" -> Reads.ranked "albums" (arg 0) invocation.options
  "artists" -> Reads.ranked "artists" (arg 0) invocation.options
  "tracks" -> Reads.ranked "tracks" (arg 0) invocation.options
  "scrobbles" -> Reads.scrobbles (arg 0) invocation.options
  "search" -> Reads.search (arg 0) invocation.options
  "stats" -> Reads.stats (arg 0)
  "nowplaying" -> Reads.nowplaying (arg 0)
  "create apikey" -> Reads.createApiKey (arg 0) invocation.options
  "tui" -> Native.tui invocation.options
  "mpd" -> Native.mpd invocation.options
  "nfc status" -> Native.nfcStatus
  "nfc read" -> Native.nfcRead invocation.options
  "nfc write" -> Native.nfcWrite invocation.options
  "card read" -> Native.cardRead
  "card write" -> Native.cardWrite invocation.options
  "login" -> Auth.login (arg 0)
  "whoami" -> Auth.whoami
  "scrobble" -> Runtime.initializeDatabase *> Scrobble.run (arg 0) (arg 1) invocation.options
  "sync" -> Runtime.initializeDatabase *> Sync.run
  "scrobble-api" -> withDb
  "import" -> Import.run (arg 0) invocation.options
  _ -> invoke
  where
  arg i = fromMaybe "" (index invocation.arguments i >>= F.asString)
  invoke = Runtime.invoke invocation.command (invocation.arguments <> [ invocation.options ])
  withDb = Runtime.initializeDatabase *> invoke
