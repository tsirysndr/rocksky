module Rocksky.Cli.Command.Scrobble (run, matchTrack) where

import Prelude
import Control.Promise (Promise, toAffE)
import Data.Maybe (Maybe(..), fromMaybe)
import Data.String (toLower)
import Effect (Effect)
import Effect.Aff (Aff, forkAff, try, throwError)
import Effect.Class (liftEffect)
import Effect.Exception (error)
import Foreign (Foreign)
import Rocksky.Cli.Client as Client
import Rocksky.Cli.Runtime as Runtime
import Rocksky.Lib.Foreign as F

foreign import cacheGetImpl :: String -> Effect (Promise Foreign)
foreign import cachePutImpl :: String -> Foreign -> Effect (Promise Unit)
foreign import publishImpl :: Foreign -> Foreign -> Boolean -> Effect (Promise Boolean)

matchTrack :: String -> String -> String -> Aff Foreign
matchTrack title artist album = do
  let
    key = toLower (title <> " - " <> artist <> if album == "" then "" else " - " <> album)
    refresh = do
      matched <- Client.matchSong (Client.new "") title artist album
      unless (F.isNullish matched) $ toAffE (cachePutImpl key matched)
      pure matched
  cached <- toAffE (cacheGetImpl key)
  matched <-
    if F.truthy cached then do
      void $ forkAff $ void $ try refresh
      pure cached
    else refresh
  when (Client.field "title" matched == "" || Client.field "artist" matched == "") $ throwError (error ("Failed to match track " <> title <> " by " <> artist))
  liftEffect $ Runtime.print ("Matched track " <> Client.field "title" matched <> " by " <> Client.field "artist" matched)
  pure matched

run :: String -> String -> Foreign -> Aff Unit
run title artist options = do
  matched <- matchTrack title artist (Client.field "album" options)
  success <- toAffE $ publishImpl matched (fromMaybe F.undefined (F.path "timestamp" options)) (F.readBooleanAt "dryRun" options == Just true)
  unless success $ liftEffect do
    Runtime.printError "Scrobble publishing failed"
    Runtime.exit 1
  liftEffect $ Runtime.exit 0
