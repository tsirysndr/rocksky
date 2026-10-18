module Rocksky.Users.Common where

import Prelude
import Data.Maybe (Maybe(..))
import Data.Number as Number
import Hono as Hono
import Rocksky.Context (Context)
import Rocksky.Metrics as Metrics
import Effect (Effect)
import Effect.Class (liftEffect)

queryNumber :: Hono.Context -> String -> Number -> Number
queryNumber c key fallback = case Hono.reqQuery c key >>= Number.fromString of
  Just n | n /= 0.0 && not (Number.isNaN n) -> n
  _ -> fallback

uri :: Hono.Context -> String -> String
uri c kind = "at://" <> Hono.reqParam c "did" <> "/app.rocksky." <> kind <> "/" <> Hono.reqParam c "rkey"

get :: Context -> Hono.App -> String -> Hono.Handler -> Effect Unit
get ctx app route handler = Hono.get app route \c -> do
  liftEffect (Metrics.count ctx.metrics "GET" ("/users" <> route))
  handler c
