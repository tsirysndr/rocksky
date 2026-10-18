-- | Type-level tags for the SQL dialects drizzle supports. They appear as a
-- | phantom parameter on `Table`, `Column`, `Database` and every query, so a
-- | Postgres table can never be queried through a SQLite connection.
module Drizzle.Dialect
  ( Dialect
  , Postgres
  , MySQL
  , SQLite
  ) where

data Dialect

foreign import data Postgres :: Dialect
foreign import data MySQL :: Dialect
foreign import data SQLite :: Dialect
