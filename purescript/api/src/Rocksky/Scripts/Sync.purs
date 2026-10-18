module Rocksky.Scripts.Sync (main, updateUris, sync, background) where

import Prelude
import Consola as Log
import Data.Array as A
import Data.Maybe (Maybe(..))
import Data.Traversable (for_)
import Effect (Effect)
import Effect.Aff (Aff)
import Effect.Class (liftEffect)
import Nats as Nats
import Rocksky.Context (Context, createContext)
import Rocksky.Lib.Aff (sleep)
import Rocksky.Scripts.Common (envString, exit, parseInt10, runScript, scriptArgs)
import Rocksky.Subscribers.Scrobble (updateUrisWithLimit, refreshScrobblesWithLimit)

size :: Effect Number
size = envString "SYNC_SIZE" >>= case _ of
  Just value | value /= "" -> pure (parseInt10 value)
  _ -> pure 20.0

updateUris :: Context -> String -> Aff Unit
updateUris ctx did = do
  n <- liftEffect size
  updateUrisWithLimit ctx n did

sync :: Context -> Boolean -> String -> Aff Unit
sync ctx isBackground did = do
  liftEffect (Log.info ("Syncing scrobbles " <> did <> " ..."))
  updateUris ctx did
  n <- if isBackground then pure 5.0 else liftEffect size
  refreshScrobblesWithLimit ctx n (not isBackground) did

background :: Context -> Aff Unit -> Aff Unit
background ctx pause = do
  liftEffect (Log.info "Wait for new scrobbles to sync ...")
  subscription <- liftEffect (Nats.subscribePull ctx.nc "rocksky.user.scrobble.sync")
  let loop = Nats.nextMessage subscription >>= case _ of
        Nothing -> pure unit
        Just msg -> do
          pause
          sync ctx true (Nats.decodeString msg)
          loop
  loop

main :: Effect Unit
main = runScript do
  ctx <- createContext
  args <- liftEffect scriptArgs
  if A.elem "--background" args then background ctx (sleep 15000)
  else for_ args (sync ctx false)
  exit 0
