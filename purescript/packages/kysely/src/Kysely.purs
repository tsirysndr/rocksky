-- | Bindings for `kysely` over better-sqlite3, covering what the auth
-- | session store and the KV driver need: raw SQL with parameters, a
-- | migrator with up/down SQL steps, and transactions.
module Kysely
  ( Kysely
  , fromSqlite
  , raw
  , rawRows
  , rawOne
  , transaction
  , Migration
  , migrateToLatest
  , destroy
  ) where

import Prelude

import Control.Promise (Promise, toAffE, fromAff)
import Data.Array (head)
import Data.Maybe (Maybe)
import BetterSqlite3 as Sqlite
import Effect (Effect)
import Effect.Aff (Aff)
import Effect.Uncurried (EffectFn1, EffectFn2, mkEffectFn1, runEffectFn2)
import Foreign (Foreign)

foreign import data Kysely :: Type

-- | `new Kysely({ dialect: new SqliteDialect({ database }) })`.
foreign import fromSqlite :: Sqlite.Database -> Effect Kysely

foreign import rawImpl :: Kysely -> String -> Array Foreign -> Effect (Promise (Array Foreign))

-- | `sql.raw`-style statement with positional `?` parameters, executed;
-- | returns the rows (empty for statements).
rawRows :: Kysely -> String -> Array Foreign -> Aff (Array Foreign)
rawRows db s ps = toAffE (rawImpl db s ps)

raw :: Kysely -> String -> Array Foreign -> Aff Unit
raw db s ps = void (rawRows db s ps)

rawOne :: Kysely -> String -> Array Foreign -> Aff (Maybe Foreign)
rawOne db s ps = head <$> rawRows db s ps

foreign import transactionImpl :: EffectFn2 Kysely (EffectFn1 Kysely (Promise Unit)) (Promise Unit)

transaction :: Kysely -> (Kysely -> Aff Unit) -> Aff Unit
transaction db f = toAffE (runEffectFn2 transactionImpl db (mkEffectFn1 \tx -> fromAff (f tx)))

-- | A migration: a name and the SQL statements to apply (`up`) and undo.
type Migration = { name :: String, up :: Array String, down :: Array String }

foreign import migrateToLatestImpl :: Kysely -> Array Migration -> Effect (Promise Unit)

migrateToLatest :: Kysely -> Array Migration -> Aff Unit
migrateToLatest db ms = toAffE (migrateToLatestImpl db ms)

foreign import destroyImpl :: Kysely -> Effect (Promise Unit)

destroy :: Kysely -> Aff Unit
destroy db = toAffE (destroyImpl db)
