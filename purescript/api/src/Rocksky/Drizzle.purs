-- | Postgres pools (`src/drizzle.ts`): a primary, an optional read replica,
-- | and the small "cancel" pools used to issue `pg_cancel_backend`.
module Rocksky.Drizzle
  ( Pools
  , createPools
  , ensureWritable
  ) where

import Prelude

import Consola as Consola
import Data.Array (head)
import Data.Int (round)
import Data.Maybe (Maybe(..), fromMaybe)
import Data.String (Pattern(..), Replacement(..), replace)
import Drizzle.Database (Database)
import Drizzle.Dialect (Postgres)
import Effect (Effect)
import Effect.Aff (Aff, error, throwError)
import Node.Path (basename)
import Node.Process (argv)
import Pg (Pool)
import Pg as Pg
import Rocksky.Lib.Env (env)
import Rocksky.Lib.Foreign (readBooleanAt, readStringAt)
import Rocksky.Lib.PgConnectionRecovery (handlePgConnectionErrors)
import Data.Array as Array

type Pools =
  { pool :: Pool
  , readPool :: Pool
  , cancelPool :: Pool
  , readCancelPool :: Pool
  , isSplit :: Boolean
  -- | Primary-backed. Correct for reads and writes alike.
  , db :: Database Postgres
  -- | Replica-backed. Only for reads that tolerate replication lag.
  , readDb :: Database Postgres
  }

-- Index and Server both use this module, so without a distinguishing name
-- every backend in pg_stat_activity looks identical.
applicationName :: Effect String
applicationName = do
  args <- argv
  let entry = fromMaybe "unknown" (Array.index args 1)
  pure $
    if env."PG_APP_NAME" /= "" then env."PG_APP_NAME"
    else "rocksky-api:" <> stripExt (basename entry)
  where
  stripExt s = replace (Pattern ".js") (Replacement "") s

writeUrl :: String
writeUrl = if env."XATA_WRITE_POSTGRES_URL" /= "" then env."XATA_WRITE_POSTGRES_URL" else env."XATA_POSTGRES_URL"

readUrl :: String
readUrl = if env."XATA_READ_POSTGRES_URL" /= "" then env."XATA_READ_POSTGRES_URL" else env."XATA_POSTGRES_URL"

poolConfig :: String -> String -> Pg.PoolConfig
poolConfig url name =
  { connectionString: url
  , max: round env."PG_MAX_CONNECTIONS"
  , idleTimeoutMillis: 30000
  -- Shorter than every handler's own timeout budget: when the pool is drained
  -- the right move is to shed the request quickly, not to sit in the checkout
  -- queue until the caller has already timed out.
  , connectionTimeoutMillis: 5000
  , application_name: name
  -- A timed-out handler cannot cancel an in-flight pg query, so it leaves its
  -- backend running. These two are the only thing that ever reclaims it.
  , statement_timeout: round env."PG_STATEMENT_TIMEOUT"
  , idle_in_transaction_session_timeout: 30000
  }

-- Dedicated to issuing pg_cancel_backend (see Rocksky.Lib.DbQuery). It has to
-- be a separate pool: the whole point is to be reachable when the main pool is
-- the thing that is saturated.
cancelConfig :: String -> String -> Pg.PoolConfig
cancelConfig url name =
  { connectionString: url
  , max: 2
  , idleTimeoutMillis: 10000
  , connectionTimeoutMillis: 2000
  , application_name: name
  , statement_timeout: 5000
  , idle_in_transaction_session_timeout: 0
  }

createPools :: Effect Pools
createPools = do
  app <- applicationName
  -- When the split is not configured both names resolve to the same endpoint.
  -- Building two pools then would silently double this process's connection
  -- count against the same server.
  let isSplit = readUrl /= writeUrl
  pool <- Pg.createPool (poolConfig writeUrl (app <> ":primary"))
  watch pool "primary"
  readPool <-
    if isSplit then do
      p <- Pg.createPool (poolConfig readUrl (app <> ":replica"))
      watch p "replica"
      pure p
    else pure pool
  cancelPool <- Pg.createPool (cancelConfig writeUrl (app <> ":cancel:primary"))
  watch cancelPool "primary cancel"
  readCancelPool <-
    if isSplit then do
      p <- Pg.createPool (cancelConfig readUrl (app <> ":cancel:replica"))
      watch p "replica cancel"
      pure p
    else pure cancelPool
  db <- Pg.drizzleFromPool pool
  readDb <- if isSplit then Pg.drizzleFromPool readPool else pure db
  pure { pool, readPool, cancelPool, readCancelPool, isSplit, db, readDb }
  where
  watch p label = handlePgConnectionErrors p label (\m -> Consola.error m)

-- | Fails unless the primary pool can actually write.
-- |
-- | XATA_POSTGRES_URL is documented as read+write but has pointed at a replica
-- | in production, which turned the write fallback into a silent hole that
-- | swallowed thousands of scrobbles. Checking at startup makes a misrouted
-- | primary loud and immediate.
ensureWritable :: Pools -> Aff Unit
ensureWritable pools = do
  r <- Pg.query pools.pool "select pg_is_in_recovery() as in_recovery, current_setting('transaction_read_only') as read_only"
  case head r.rows of
    Nothing -> pure unit
    Just row -> do
      let inRecovery = fromMaybe false (readBooleanAt "in_recovery" row)
          readOnly = fromMaybe "off" (readStringAt "read_only" row)
      when (inRecovery || readOnly == "on") $
        throwError $ error $
          "The write endpoint is read-only (pg_is_in_recovery=" <> show inRecovery
            <> ", transaction_read_only=" <> readOnly <> "). Point XATA_WRITE_POSTGRES_URL at the "
            <> "primary — XATA_POSTGRES_URL is currently a replica and cannot accept writes."
