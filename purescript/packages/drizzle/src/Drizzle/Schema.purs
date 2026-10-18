-- | Dialect-independent parts of a schema: the `Table` and `Column` types and
-- | the column modifiers every dialect shares. Column constructors live in
-- | `Drizzle.PG.Schema`, `Drizzle.MySQL.Schema` and `Drizzle.SQLite.Schema`.
module Drizzle.Schema
  ( Table
  , Column
  , class Columns
  , class ColumnsList
  , columns
  , tableName
  , toSQL
  , tableSQL
  , notNull
  , primaryKey
  , unique
  , withDefault
  , defaultSQL
  ) where

import Data.Nullable (Nullable)
import Drizzle.Dialect (Dialect)
import Drizzle.SQL (SQL)
import Prim.RowList (class RowToList, RowList, Cons, Nil)
import Unsafe.Coerce (unsafeCoerce)

-- | A table of dialect `d`. `cols` is a row of `Column d` types, e.g.
-- | `( id :: Column Postgres Int, name :: Column Postgres (Nullable String) )`.
foreign import data Table :: Dialect -> Row Type -> Type

-- | A column of dialect `d` whose selected value has PureScript type `a`.
foreign import data Column :: Dialect -> Type -> Type

-- | Every field of `cols` is a `Column d _`. Enforced by each dialect's
-- | `table` constructor.
class Columns (d :: Dialect) (cols :: Row Type)

instance (RowToList cols cl, ColumnsList d cl) => Columns d cols

class ColumnsList (d :: Dialect) (cl :: RowList Type)

instance ColumnsList d Nil

instance ColumnsList d tail => ColumnsList d (Cons sym (Column d a) tail)

-- | The table's columns as a record, for building conditions:
-- | `(columns users).id`.
foreign import columns :: forall d cols. Table d cols -> Record cols

foreign import tableName :: forall d cols. Table d cols -> String

-- | Every column is also a SQL expression (same JS object, no conversion).
toSQL :: forall d a. Column d a -> SQL
toSQL = unsafeCoerce

-- | A whole table as a projection value: `{ track: tableSQL tracks }` selects
-- | every column of `tracks` under the key `track`.
tableSQL :: forall d cols. Table d cols -> SQL
tableSQL = unsafeCoerce

-- Modifiers. Use with `#`: `text "name" # notNull # unique`.

-- | Columns are nullable by default; `notNull` removes the `Nullable`.
foreign import notNull :: forall d a. Column d (Nullable a) -> Column d a

-- | Keeps the value type. For a non-serial key write `# notNull # primaryKey`.
foreign import primaryKey :: forall d a. Column d a -> Column d a

foreign import unique :: forall d a. Column d a -> Column d a

-- | A constant default value.
foreign import withDefault :: forall d a. a -> Column d a -> Column d a

-- | A default computed by the database, e.g. `defaultSQL (raw "now()")`.
foreign import defaultSQL :: forall d a. SQL -> Column d a -> Column d a
