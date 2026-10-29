module Rocksky.Notifications.Push (app, publish) where

import Prelude
import Control.Promise (Promise, toAffE)
import Data.Either (Either(..))
import Data.Maybe (Maybe(..))
import Data.String.CodeUnits as String
import Effect (Effect)
import Effect.Aff (attempt)
import Hono as Hono
import Pg (Pool)
import Rocksky.Context (Context)
import Rocksky.Lib.Foreign (readStringAt, toForeign)
import Rocksky.Lib.Rest as Rest

foreign import saveDeviceImpl :: Pool -> String -> String -> Boolean -> Effect (Promise Unit)
foreign import publishImpl :: Pool -> String -> String -> Effect Unit

publish :: Context -> String -> String -> Effect Unit
publish ctx = publishImpl ctx.pools.pool

app :: Context -> Effect Hono.App
app ctx = do
  a <- Hono.new
  let handler remove c = do
        result <- attempt (Rest.resolveUser ctx c)
        case result of
          Right (Just user) -> do
            body <- attempt (Hono.reqJson c)
            case body of
              Right value | Just token <- readStringAt "token" value
                , String.length token > 0 && String.length token <= 4096 -> do
                  toAffE (saveDeviceImpl ctx.pools.pool user.id token remove)
                  Rest.json c 200 (toForeign { status: "ok" })
              _ -> Rest.text c 400 "Invalid device token"
          _ -> Rest.text c 401 "Unauthorized"
  Hono.post a "/devices" (handler false)
  Hono.post a "/devices/remove" (handler true)
  pure a
