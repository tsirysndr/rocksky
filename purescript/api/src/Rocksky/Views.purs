-- | The materialized-view refresher: a 30-minute cron and nothing else.
-- |
-- | This runs as its own process so it cannot take the XRPC API down with it.
-- | A refresh is long database work, and node-cron has wedged the event loop
-- | it shares before now (the October 2026 DST fall-back), which left the HTTP
-- | server alive but no longer accepting connections.
module Rocksky.Views (main, refreshViews) where

import Prelude

import Consola as Consola
import Data.Either (Either(..))
import Data.Traversable (for_)
import Effect (Effect)
import Effect.Aff (Aff, attempt, finally, launchAff_, message)
import Effect.Class (liftEffect)
import NodeCron as Cron
import Pg as Pg
import Rocksky.Context (createContext)
import Rocksky.Lib.Process (installCrashHandlers, setDnsIpv4First)
import Rocksky.Otel as Otel

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
    liftEffect (Consola.info "Rocksky materialized view refresher is running")
