-- | Driver: Bun's built-in SQLite (`bun:sqlite`). The module can be imported
-- | under Node.js, but `open` only works under Bun; check `available`, or use
-- | `Drizzle.SQLite.BetterSQLite3` / `Drizzle.SQLite.LibSQL` on Node.
module Drizzle.SQLite.BunSQLite
  ( available
  , open
  , close
  ) where

import Prelude

import Control.Promise (Promise, toAffE)
import Drizzle.Database (Database)
import Drizzle.Dialect (SQLite)
import Effect (Effect)
import Effect.Aff (Aff)

-- | True when running under Bun.
foreign import available :: Effect Boolean

foreign import openImpl :: String -> Effect (Promise (Database SQLite))
foreign import closeImpl :: Database SQLite -> Effect (Promise Unit)

-- | Open a database file; `":memory:"` opens an in-memory database.
open :: String -> Aff (Database SQLite)
open filename = toAffE (openImpl filename)

close :: Database SQLite -> Aff Unit
close db = toAffE (closeImpl db)
