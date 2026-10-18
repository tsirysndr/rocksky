-- | SQLite tables and column types. SQLite only has integer, real, text and
-- | blob storage; booleans and timestamps are integers with a mode.
module Drizzle.SQLite.Schema
  ( table
  , integer
  , integerBoolean
  , integerTimestamp
  , text
  , real
  , primaryKeyAutoIncrement
  ) where

import Data.JSDate (JSDate)
import Data.Nullable (Nullable)
import Drizzle.Dialect (SQLite)
import Drizzle.Schema (class Columns, Column, Table)

foreign import tableImpl :: forall cols. String -> Record cols -> Table SQLite cols

table :: forall cols. Columns SQLite cols => String -> Record cols -> Table SQLite cols
table = tableImpl

foreign import integer :: String -> Column SQLite (Nullable Int)
-- | An integer column holding 0 or 1, read and written as a `Boolean`.
foreign import integerBoolean :: String -> Column SQLite (Nullable Boolean)
-- | An integer column holding milliseconds since the epoch, read as a date.
foreign import integerTimestamp :: String -> Column SQLite (Nullable JSDate)
foreign import text :: String -> Column SQLite (Nullable String)
foreign import real :: String -> Column SQLite (Nullable Number)

-- | `integer primary key autoincrement`: the SQLite equivalent of `serial`.
foreign import primaryKeyAutoIncrement :: Column SQLite (Nullable Int) -> Column SQLite Int
