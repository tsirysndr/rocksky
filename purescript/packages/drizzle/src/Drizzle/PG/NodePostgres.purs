-- | Driver: node-postgres (`pg`). Requires the `pg` npm package.
module Drizzle.PG.NodePostgres
  ( connect
  , close
  , mock
  ) where

import Prelude

import Control.Promise (Promise, toAffE)
import Drizzle.Database (Database)
import Drizzle.Dialect (Postgres)
import Effect (Effect)
import Effect.Aff (Aff)

foreign import connectImpl :: String -> Effect (Database Postgres)
foreign import closeImpl :: Database Postgres -> Effect (Promise Unit)

-- | A database with no connection, for rendering queries with `toQuery`.
foreign import mock :: Effect (Database Postgres)

-- | Create a connection pool from a `postgres://` connection string.
-- | Connections are opened lazily on first query.
connect :: String -> Effect (Database Postgres)
connect = connectImpl

-- | Drain and close the pool.
close :: Database Postgres -> Aff Unit
close db = toAffE (closeImpl db)
