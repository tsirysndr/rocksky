-- | Postgres tables and column types. Modifiers shared by all dialects
-- | (`notNull`, `primaryKey`, `unique`, `withDefault`, `defaultSQL`) are in
-- | `Drizzle.Schema`.
module Drizzle.PG.Schema
  ( table
  , serial
  , integer
  , bigint
  , text
  , varchar
  , boolean
  , real
  , doublePrecision
  , timestamp
  , timestampTz
  , jsonb
  , textArray
  , integerArray
  , defaultNow
  , references
  , referencesLazy
  , typed
  ) where

import Prelude (Unit)

import Data.JSDate (JSDate)
import Data.Nullable (Nullable)
import Drizzle.Dialect (Postgres)
import Drizzle.Schema (class Columns, Column, Table)
import Foreign (Foreign)
import Unsafe.Coerce (unsafeCoerce)

foreign import tableImpl :: forall cols. String -> Record cols -> Table Postgres cols

table :: forall cols. Columns Postgres cols => String -> Record cols -> Table Postgres cols
table = tableImpl

-- Columns are nullable unless told otherwise, so the value type is wrapped
-- in `Nullable`. `serial` is always not null.
foreign import serial :: String -> Column Postgres Int
foreign import integer :: String -> Column Postgres (Nullable Int)
foreign import bigint :: String -> Column Postgres (Nullable Number)
foreign import text :: String -> Column Postgres (Nullable String)
foreign import varchar :: String -> Int -> Column Postgres (Nullable String)
foreign import boolean :: String -> Column Postgres (Nullable Boolean)
foreign import real :: String -> Column Postgres (Nullable Number)
foreign import doublePrecision :: String -> Column Postgres (Nullable Number)
foreign import timestamp :: String -> Column Postgres (Nullable JSDate)
-- | `timestamp(name, { withTimezone: true })`.
foreign import timestampTz :: String -> Column Postgres (Nullable JSDate)
-- | Untyped JSON column. Use `typed` to give it a PureScript type.
foreign import jsonb :: String -> Column Postgres (Nullable Foreign)
-- | `text(name).array()`.
foreign import textArray :: String -> Column Postgres (Nullable (Array String))
foreign import integerArray :: String -> Column Postgres (Nullable (Array Int))

-- | Default to `now()`. Apply after `notNull`:
-- | `timestamp "created_at" # notNull # defaultNow`.
foreign import defaultNow :: Column Postgres JSDate -> Column Postgres JSDate

-- | `.references(() => other.id)`. The target is a column of another table
-- | (same value type). Only drizzle-kit reads it; queries are unaffected.
foreign import references :: forall a b. Column Postgres b -> Column Postgres a -> Column Postgres a

-- | Like `references` but the target is resolved on first use, for tables
-- | that reference each other.
foreign import referencesLazy :: forall a b. (Unit -> Column Postgres b) -> Column Postgres a -> Column Postgres a

-- | `.$type<T>()`: reinterpret the value type (e.g. a `jsonb` column).
typed :: forall a b. Column Postgres (Nullable a) -> Column Postgres (Nullable b)
typed = unsafeCoerce
