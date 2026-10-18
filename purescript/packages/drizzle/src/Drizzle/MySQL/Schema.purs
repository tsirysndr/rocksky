-- | MySQL tables and column types. Modifiers shared by all dialects are in
-- | `Drizzle.Schema`. Note MySQL has no `returning`, so the `run*Returning`
-- | functions in `Drizzle.Query` are not available for MySQL tables.
module Drizzle.MySQL.Schema
  ( table
  , serial
  , int
  , bigint
  , varchar
  , text
  , boolean
  , double
  , timestamp
  , datetime
  , autoIncrement
  , defaultNow
  ) where

import Data.JSDate (JSDate)
import Data.Nullable (Nullable)
import Drizzle.Dialect (MySQL)
import Drizzle.Schema (class Columns, Column, Table)

foreign import tableImpl :: forall cols. String -> Record cols -> Table MySQL cols

table :: forall cols. Columns MySQL cols => String -> Record cols -> Table MySQL cols
table = tableImpl

-- | `bigint unsigned not null auto_increment`.
foreign import serial :: String -> Column MySQL Int
foreign import int :: String -> Column MySQL (Nullable Int)
foreign import bigint :: String -> Column MySQL (Nullable Number)
foreign import varchar :: String -> Int -> Column MySQL (Nullable String)
foreign import text :: String -> Column MySQL (Nullable String)
foreign import boolean :: String -> Column MySQL (Nullable Boolean)
foreign import double :: String -> Column MySQL (Nullable Number)
foreign import timestamp :: String -> Column MySQL (Nullable JSDate)
foreign import datetime :: String -> Column MySQL (Nullable JSDate)

foreign import autoIncrement :: forall a. Column MySQL a -> Column MySQL a

-- | Default to `now()`. Apply after `notNull`.
foreign import defaultNow :: Column MySQL JSDate -> Column MySQL JSDate
