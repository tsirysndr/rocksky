module Drizzle.Query
  ( class TableRow
  , class TableRowList
  , class SubRow
  , class SubRowList
  , class Returning
  , class Filterable
  , where_
  , class ToQuery
  , toQuery
  , Query
  , Select
  , select
  , orderBy
  , limit
  , offset
  , runSelect
  , Insert
  , insert
  , runInsert
  , runInsertReturning
  , Update
  , update
  , runUpdate
  , runUpdateReturning
  , Delete
  , deleteFrom
  , runDelete
  , runDeleteReturning
  ) where

import Prelude

import Control.Promise (Promise, toAffE)
import Data.Maybe (Maybe(..))
import Data.Nullable (Nullable, toNullable)
import Drizzle.Database (Database)
import Drizzle.Dialect (Dialect, Postgres, SQLite)
import Drizzle.Schema (Column, Table)
import Drizzle.SQL (SQL)
import Effect (Effect)
import Effect.Aff (Aff)
import Foreign (Foreign)
import Prim.Row as Row
import Prim.RowList (class RowToList, RowList, Cons, Nil)

-- | Maps a row of columns to the row of values a query returns:
-- | `( id :: Column d Int, age :: Column d (Nullable Int) )` gives
-- | `( id :: Int, age :: Nullable Int )`. The fundep `cols -> r` means the
-- | compiler computes `r` from `cols`, so result types are inferred.
class TableRow (cols :: Row Type) (r :: Row Type) | cols -> r

instance (RowToList cols cl, TableRowList cl r) => TableRow cols r

-- | Same thing, walking a `RowList` one label at a time.
class TableRowList (cl :: RowList Type) (r :: Row Type) | cl -> r

instance TableRowList Nil ()

instance (TableRowList tail r', Row.Cons sym a r' r) => TableRowList (Cons sym (Column d a) tail) r

-- | `sub` only uses labels that exist in `r`, with the same types.
-- | Used to check insert and update records against the table row.
class SubRow (sub :: Row Type) (r :: Row Type)

instance (RowToList sub sl, SubRowList sl r) => SubRow sub r

class SubRowList (sl :: RowList Type) (r :: Row Type)

instance SubRowList Nil r

instance (Row.Cons sym a r' r, SubRowList tail r) => SubRowList (Cons sym a tail) r

-- | Dialects that support `returning` clauses. MySQL does not.
class Returning (d :: Dialect)

instance Returning Postgres
instance Returning SQLite

-- | Queries that accept a `where` clause. Calling `where_` twice replaces
-- | the condition, as in drizzle; combine conditions with `SQL.and`.
class Filterable q where
  where_ :: SQL -> q -> q

-- | A rendered query: SQL text with placeholders, plus the bound parameters.
type Query = { sql :: String, params :: Array Foreign }

-- | Render a query without executing it. The database is only used for its
-- | dialect, so a mock (see `Drizzle.MySQL.MySQL2.mock`) works.
class ToQuery q (d :: Dialect) | q -> d where
  toQuery :: Database d -> q -> Query

-- Select ---------------------------------------------------------------------

newtype Select d cols = Select
  { table :: Table d cols
  , cond :: Maybe SQL
  , orderBy :: Array SQL
  , limit :: Maybe Int
  , offset :: Maybe Int
  }

instance Filterable (Select d cols) where
  where_ c (Select s) = Select s { cond = Just c }

instance ToQuery (Select d cols) d where
  toQuery db (Select s) = selectQuery db (selectConfig s)

select :: forall d cols. Table d cols -> Select d cols
select t = Select { table: t, cond: Nothing, orderBy: [], limit: Nothing, offset: Nothing }

orderBy :: forall d cols. Array SQL -> Select d cols -> Select d cols
orderBy xs (Select s) = Select s { orderBy = xs }

limit :: forall d cols. Int -> Select d cols -> Select d cols
limit n (Select s) = Select s { limit = Just n }

offset :: forall d cols. Int -> Select d cols -> Select d cols
offset n (Select s) = Select s { offset = Just n }

type SelectConfig d cols =
  { table :: Table d cols
  , cond :: Nullable SQL
  , orderBy :: Array SQL
  , limit :: Nullable Int
  , offset :: Nullable Int
  }

selectConfig
  :: forall d cols
   . { table :: Table d cols, cond :: Maybe SQL, orderBy :: Array SQL, limit :: Maybe Int, offset :: Maybe Int }
  -> SelectConfig d cols
selectConfig s =
  { table: s.table
  , cond: toNullable s.cond
  , orderBy: s.orderBy
  , limit: toNullable s.limit
  , offset: toNullable s.offset
  }

foreign import selectImpl
  :: forall d cols r. Database d -> SelectConfig d cols -> Effect (Promise (Array (Record r)))

foreign import selectQuery :: forall d cols. Database d -> SelectConfig d cols -> Query

runSelect :: forall d cols r. TableRow cols r => Database d -> Select d cols -> Aff (Array (Record r))
runSelect db (Select s) = toAffE (selectImpl db (selectConfig s))

-- Insert ---------------------------------------------------------------------

newtype Insert d cols i = Insert { table :: Table d cols, rows :: Array (Record i) }

instance ToQuery (Insert d cols i) d where
  toQuery db (Insert s) = insertQuery db s

insert
  :: forall d cols r i
   . TableRow cols r
  => SubRow i r
  => Table d cols
  -> Array (Record i)
  -> Insert d cols i
insert t rows = Insert { table: t, rows }

type InsertConfig d cols i = { table :: Table d cols, rows :: Array (Record i) }

foreign import insertImpl
  :: forall d cols i. Database d -> InsertConfig d cols i -> Effect (Promise Unit)

foreign import insertReturningImpl
  :: forall d cols i r. Database d -> InsertConfig d cols i -> Effect (Promise (Array (Record r)))

foreign import insertQuery :: forall d cols i. Database d -> InsertConfig d cols i -> Query

runInsert :: forall d cols i. Database d -> Insert d cols i -> Aff Unit
runInsert db (Insert s) = toAffE (insertImpl db s)

runInsertReturning
  :: forall d cols i r
   . Returning d
  => TableRow cols r
  => Database d
  -> Insert d cols i
  -> Aff (Array (Record r))
runInsertReturning db (Insert s) = toAffE (insertReturningImpl db s)

-- Update ---------------------------------------------------------------------

newtype Update d cols i = Update { table :: Table d cols, changes :: Record i, cond :: Maybe SQL }

instance Filterable (Update d cols i) where
  where_ c (Update s) = Update s { cond = Just c }

instance ToQuery (Update d cols i) d where
  toQuery db (Update s) = updateQuery db (updateConfig s)

update
  :: forall d cols r i
   . TableRow cols r
  => SubRow i r
  => Table d cols
  -> Record i
  -> Update d cols i
update t changes = Update { table: t, changes, cond: Nothing }

type UpdateConfig d cols i = { table :: Table d cols, changes :: Record i, cond :: Nullable SQL }

updateConfig
  :: forall d cols i
   . { table :: Table d cols, changes :: Record i, cond :: Maybe SQL }
  -> UpdateConfig d cols i
updateConfig s = { table: s.table, changes: s.changes, cond: toNullable s.cond }

foreign import updateImpl
  :: forall d cols i. Database d -> UpdateConfig d cols i -> Effect (Promise Unit)

foreign import updateReturningImpl
  :: forall d cols i r. Database d -> UpdateConfig d cols i -> Effect (Promise (Array (Record r)))

foreign import updateQuery :: forall d cols i. Database d -> UpdateConfig d cols i -> Query

runUpdate :: forall d cols i. Database d -> Update d cols i -> Aff Unit
runUpdate db (Update s) = toAffE (updateImpl db (updateConfig s))

runUpdateReturning
  :: forall d cols i r
   . Returning d
  => TableRow cols r
  => Database d
  -> Update d cols i
  -> Aff (Array (Record r))
runUpdateReturning db (Update s) = toAffE (updateReturningImpl db (updateConfig s))

-- Delete ---------------------------------------------------------------------

newtype Delete d cols = Delete { table :: Table d cols, cond :: Maybe SQL }

instance Filterable (Delete d cols) where
  where_ c (Delete s) = Delete s { cond = Just c }

instance ToQuery (Delete d cols) d where
  toQuery db (Delete s) = deleteQuery db (deleteConfig s)

deleteFrom :: forall d cols. Table d cols -> Delete d cols
deleteFrom t = Delete { table: t, cond: Nothing }

type DeleteConfig d cols = { table :: Table d cols, cond :: Nullable SQL }

deleteConfig :: forall d cols. { table :: Table d cols, cond :: Maybe SQL } -> DeleteConfig d cols
deleteConfig s = { table: s.table, cond: toNullable s.cond }

foreign import deleteImpl
  :: forall d cols. Database d -> DeleteConfig d cols -> Effect (Promise Unit)

foreign import deleteReturningImpl
  :: forall d cols r. Database d -> DeleteConfig d cols -> Effect (Promise (Array (Record r)))

foreign import deleteQuery :: forall d cols. Database d -> DeleteConfig d cols -> Query

runDelete :: forall d cols. Database d -> Delete d cols -> Aff Unit
runDelete db (Delete s) = toAffE (deleteImpl db (deleteConfig s))

runDeleteReturning
  :: forall d cols r
   . Returning d
  => TableRow cols r
  => Database d
  -> Delete d cols
  -> Aff (Array (Record r))
runDeleteReturning db (Delete s) = toAffE (deleteReturningImpl db (deleteConfig s))
