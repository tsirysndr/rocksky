-- | Bindings for `@hono/node-server`.
module Hono.NodeServer (serve, serveOn, Server) where

import Effect (Effect)
import Hono (App)

foreign import data Server :: Type

-- | `serve({ fetch: app.fetch, port })`.
foreign import serve :: App -> Int -> Effect Server

-- | `serve({ fetch: app.fetch, hostname, port })`.
foreign import serveOn :: App -> String -> Int -> Effect Server
