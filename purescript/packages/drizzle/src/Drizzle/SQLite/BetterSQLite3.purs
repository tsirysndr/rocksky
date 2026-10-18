-- | Driver: better-sqlite3, for Node.js. Requires the `better-sqlite3` npm
-- | package. The module can be imported under Bun, but `open` only works on
-- | Node.js; check `available`, or use `Drizzle.SQLite.BunSQLite` on Bun.
module Drizzle.SQLite.BetterSQLite3
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

-- | True when not running under Bun.
foreign import available :: Effect Boolean

foreign import openImpl :: String -> Effect (Promise (Database SQLite))
foreign import closeImpl :: Database SQLite -> Effect (Promise Unit)

-- | Open a database file; `":memory:"` opens an in-memory database.
open :: String -> Aff (Database SQLite)
open filename = toAffE (openImpl filename)

close :: Database SQLite -> Aff Unit
close db = toAffE (closeImpl db)
