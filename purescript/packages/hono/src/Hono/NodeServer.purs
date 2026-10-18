-- | Bindings for `@hono/node-server`.
module Hono.NodeServer (serve, Server) where

import Effect (Effect)
import Hono (App)

foreign import data Server :: Type

-- | `serve({ fetch: app.fetch, port })`.
foreign import serve :: App -> Int -> Effect Server
