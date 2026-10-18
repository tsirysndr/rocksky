-- | The XRPC service entrypoint (`src/server.ts`): express + the lexicon
-- | router, a proxy to the Hono REST API for everything else, and the
-- | materialized-view refresh cron.
module Rocksky.Server (main, refreshViews) where

import Prelude

import Atproto.XrpcServer (defaultOptions)
import Atproto.XrpcServer as XrpcServer
import Consola as Consola
import Data.Either (Either(..))
import Data.Int (fromString)
import Data.Maybe (fromMaybe)
import Data.Traversable (for_)
import Effect (Effect)
import Effect.Aff (Aff, attempt, finally, launchAff_, message)
import Effect.Class (liftEffect)
import Express as Express
import Express.Cors as Cors
import HttpProxyMiddleware (createProxyMiddleware)
import Node.Process (lookupEnv)
import NodeCron as Cron
import Pg as Pg
import Rocksky.Context (createContext)
import Rocksky.Lexicon (createServer)
import Rocksky.Lib.Process (installCrashHandlers, setDnsIpv4First)
import Rocksky.Lib.XrpcTelemetry (xrpcTelemetry)
import Rocksky.Otel as Otel
import Rocksky.Xrpc.Index as Xrpc

materializedViews :: Array String
materializedViews =
  [ "user_artists_mv", "top_scrobblers_mv", "scrobbles_per_day_mv", "user_hour_scrobbles_mv", "chart_artists_mv", "chart_tracks_mv" ]

-- Always destroy the dedicated client, including when SET fails.
refreshViews :: Pg.Pool -> Aff Unit
refreshViews pool = do
  client <- Pg.connect pool
  finally (liftEffect (Pg.releaseDestroy client)) do
    result <- attempt do
      _ <- Pg.clientQuery client "SET statement_timeout = 0"
      for_ materializedViews \view -> do
        refreshed <- attempt do
          _ <- Pg.clientQuery client ("REFRESH MATERIALIZED VIEW CONCURRENTLY " <> view)
          when (view == "user_artists_mv") $ void (Pg.clientQuery client "VACUUM (ANALYZE, TRUNCATE FALSE) user_artists_mv")
        case refreshed of
          Left err -> liftEffect (Consola.error ("Failed to refresh " <> view <> ": " <> message err))
          Right _ -> pure unit
    case result of
      Left err -> liftEffect (Consola.error ("Failed to run materialized view refresh: " <> message err))
      Right _ -> pure unit

main :: Effect Unit
main = do
  Otel.start
  setDnsIpv4First
  installCrashHandlers
  launchAff_ do
    ctx <- createContext
    -- A concurrent refresh runs far longer than the pool's statement_timeout,
    -- so it needs its own client with the cap lifted rather than a pooled query.
    _ <- liftEffect $ Cron.schedule "*/30 * * * *" do
      refreshViews ctx.pools.pool
    liftEffect do
      proxy <- createProxyMiddleware "http://localhost:8000"
      server <- createServer ctx.lexiconDocs defaultOptions
      Xrpc.register server ctx
      app <- Express.new
      Cors.cors app
      telemetry <- xrpcTelemetry ctx.metrics
      Express.useMiddleware app telemetry
      Express.useRouter app (XrpcServer.router server)
      Express.useRouter app proxy
      portEnv <- lookupEnv "ROCKSKY_XPRC_PORT"
      let port = fromMaybe 3004 (portEnv >>= fromString)
      Express.listen app port do
        Consola.info ("Rocksky XRPC API is running on port " <> show port)
