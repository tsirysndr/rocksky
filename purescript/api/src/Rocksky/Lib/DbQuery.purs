-- | Runs a query on a dedicated pooled client that is cancelled server-side
-- | when the calling fiber is killed (`src/lib/dbQuery.ts`).
-- |
-- | A timed-out handler returns its fallback but a plain query keeps running
-- | and keeps its connection checked out until it finishes on its own. Under
-- | load that is self-reinforcing: the abandoned queries are what exhaust the
-- | pool. Here the kill reaches a `pg_cancel_backend` issued from a separate
-- | pool, so the backend actually stops.
module Rocksky.Lib.DbQuery (dbQuery, readQuery, queryWith) where

import Prelude

import Consola as Consola
import Data.Either (Either(..))
import Data.Maybe (Maybe(..))
import Drizzle.Database (Database)
import Drizzle.Dialect (Postgres)
import Effect.Aff (Aff, attempt, error, message, throwError)
import Effect.Class (liftEffect)
import Pg (Pool)
import Pg as Pg
import Rocksky.Drizzle (Pools)
import Rocksky.Lib.Aff (bracketKilled, forkAndForget)
import Rocksky.Lib.Foreign (toForeign)

cancelBackend :: Pool -> Int -> Aff Unit
cancelBackend canceller pid = do
  r <- attempt do
    client <- Pg.connect canceller
    res <- attempt (Pg.clientQueryParams client "SELECT pg_cancel_backend($1)" [ toForeign pid ])
    liftEffect (Pg.release client)
    case res of
      Left e -> throwError e
      Right _ -> pure unit
  case r of
    Left e -> liftEffect (Consola.warn ("Failed to cancel pg backend " <> show pid <> ": " <> message e))
    Right _ -> pure unit

queryWith :: forall a. Pool -> Pool -> String -> (Database Postgres -> Aff a) -> Aff a
queryWith source canceller label run =
  bracketKilled acquire release \client -> do
    db <- liftEffect (Pg.drizzleFromClient client)
    r <- attempt (run db)
    case r of
      Left e -> throwError (error (label <> ": " <> message e))
      Right a -> pure a
  where
  acquire = do
    r <- attempt (Pg.connect source)
    case r of
      Left e -> throwError (error (label <> ": failed to acquire pg client: " <> message e))
      Right c -> pure c
  -- After a cancel the client may still be draining the killed statement, so
  -- discard it instead of handing a half-read connection back.
  release client killed =
    if killed then do
      case Pg.processID client of
        Just pid -> forkAndForget (cancelBackend canceller pid)
        Nothing -> pure unit
      liftEffect (Pg.releaseDestroy client)
    else liftEffect (Pg.release client)

-- | Runs against the primary. Use for writes, and for reads that must reflect
-- | a write that just happened.
dbQuery :: forall a. Pools -> String -> (Database Postgres -> Aff a) -> Aff a
dbQuery p = queryWith p.pool p.cancelPool

-- | Runs against the read replica (the primary when none is configured). Use
-- | for catalogue, aggregate and chart reads.
readQuery :: forall a. Pools -> String -> (Database Postgres -> Aff a) -> Aff a
readQuery p = queryWith p.readPool p.readCancelPool
