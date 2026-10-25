-- | The XRPC service entrypoint (`src/server.ts`): express + the lexicon
-- | router, and a proxy to the Hono REST API for everything else. The
-- | materialized-view refresh cron runs separately, in `Rocksky.Views`.
module Rocksky.Server (main, health) where

import Prelude

import Atproto.XrpcServer (defaultOptions)
import Atproto.XrpcServer as XrpcServer
import Consola as Consola
import Data.Int (fromString)
import Data.Maybe (fromMaybe)
import Effect (Effect)
import Effect.Aff (launchAff_)
import Effect.Class (liftEffect)
import Express as Express
import Express.Cors as Cors
import HttpProxyMiddleware (createProxyMiddleware)
import Node.Process (lookupEnv)
import Rocksky.Lib.Foreign (toForeign)
import Rocksky.Context (createContext)
import Rocksky.Lexicon (createServer)
import Rocksky.Lib.Process (installCrashHandlers, setDnsIpv4First)
import Rocksky.Lib.XrpcTelemetry (xrpcTelemetry)
import Rocksky.Otel as Otel
import Rocksky.Xrpc.Index as Xrpc

main :: Effect Unit
main = do
  Otel.start
  setDnsIpv4First
  installCrashHandlers
  launchAff_ do
    ctx <- createContext
    liftEffect do
      proxy <- createProxyMiddleware "http://localhost:8000"
      server <- createServer ctx.lexiconDocs defaultOptions
      Xrpc.register server ctx
      app <- Express.new
      Cors.cors app
      telemetry <- xrpcTelemetry ctx.metrics
      Express.useMiddleware app telemetry
      Express.useMiddleware app health
      Express.useRouter app (XrpcServer.router server)
      Express.useRouter app proxy
      portEnv <- lookupEnv "ROCKSKY_XPRC_PORT"
      let port = fromMaybe 3004 (portEnv >>= fromString)
      Express.listen app port do
        Consola.info ("Rocksky XRPC API is running on port " <> show port)

-- Liveness of this XRPC process, independent of REST and storage.
health :: Express.Middleware
health req res next =
  if Express.reqPath req == "/xrpc/_health" && (Express.reqMethod req == "GET" || Express.reqMethod req == "HEAD") then do
    Express.setHeader res "Cache-Control" "no-store"
    Express.sendJson res (toForeign { status: "ok", version: "0.0.1" })
  else next
