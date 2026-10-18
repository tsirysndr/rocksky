-- | The embedded SQLite driver for the current runtime: `bun:sqlite` under
-- | Bun, better-sqlite3 under Node.js. Use this when a program should run on
-- | both without caring which.
module Drizzle.SQLite.Native
  ( open
  , close
  ) where

import Prelude

import Drizzle.Database (Database)
import Drizzle.Dialect (SQLite)
import Drizzle.SQLite.BetterSQLite3 as BetterSQLite3
import Drizzle.SQLite.BunSQLite as BunSQLite
import Effect (Effect)
import Effect.Aff (Aff)
import Effect.Class (liftEffect)

foreign import isBun :: Effect Boolean

-- | Open a database file; `":memory:"` opens an in-memory database.
open :: String -> Aff (Database SQLite)
open filename = do
  bun <- liftEffect isBun
  if bun then BunSQLite.open filename else BetterSQLite3.open filename

-- | Both drivers close the same way (`db.$client.close()`).
close :: Database SQLite -> Aff Unit
close = BunSQLite.close
