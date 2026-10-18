-- | A query builder for everything `Drizzle.Query` leaves out: projections,
-- | joins, grouping, subqueries, aliases, `onConflict` and dynamic shapes.
-- |
-- | Result rows are not inferred here; the caller annotates them
-- | (`rows :: Array { id :: String, playCount :: Int } <- run db q`). With
-- | `selectFrom` plus joins, drizzle keys each row by table name
-- | (`{ tracks: {...}, albums: {...} }`), a left-joined table being `null`
-- | when unmatched; with `selectFields` the keys are the projection's.
module Drizzle.Builder
  ( SelectQ
  , Subquery
  , selectFrom
  , selectFields
  , selectFieldsFrom
  , selectFieldsFromSub
  , selectDistinctFields
  , innerJoin
  , leftJoin
  , innerJoinSub
  , leftJoinSub
  , groupBy
  , having
  , orderBy
  , limit
  , limitNumber
  , offset
  , offsetNumber
  , as
  , subquerySQL
  , subqueryColumns
  , aliasTable
  , run
  , runOne
  , runForeign
  , toQuery
  , querySQL
  , InsertQ
  , insert
  , insertForeign
  , onConflictDoNothing
  , onConflictDoNothingOn
  , onConflictDoUpdate
  , runInsert
  , runInsertReturning
  , UpdateQ
  , update
  , updateForeign
  , runUpdate
  , runUpdateReturning
  , DeleteQ
  , deleteFrom
  , runDelete
  , runDeleteReturning
  ) where

import Prelude

import Control.Promise (Promise, toAffE)
import Data.Array (head)
import Data.Maybe (Maybe)
import Data.Nullable (Nullable, toNullable)
import Drizzle.Database (Database)
import Drizzle.Dialect (Dialect)
import Drizzle.Query (class Filterable, class SubRow, class TableRow, Query)
import Drizzle.SQL (SQL)
import Drizzle.Schema (Table)
import Effect (Effect)
import Effect.Aff (Aff)
import Foreign (Foreign)
import Unsafe.Coerce (unsafeCoerce)

-- Select ---------------------------------------------------------------------

-- | A select under construction. Pure: nothing touches drizzle until `run`.
foreign import data SelectQ :: Dialect -> Type

-- | A named subquery (`select ... as "name"`). Usable as a join target, as a
-- | `from`, or as an expression via `subquerySQL`.
foreign import data Subquery :: Dialect -> Type

-- | `db.select().from(table)`: every column of the table.
foreign import selectFrom :: forall d cols. Table d cols -> SelectQ d

-- | `db.select({ a: t.col, n: count() }).from(table)`. The record's values are
-- | columns (`toSQL col`), whole tables (`tableSQL t`) or fragments.
foreign import selectFieldsFrom :: forall d cols f. Record f -> Table d cols -> SelectQ d

-- | Same as `selectFieldsFrom`, with the arguments flipped for `#` pipelines.
selectFields :: forall d cols f. Table d cols -> Record f -> SelectQ d
selectFields t f = selectFieldsFrom f t

foreign import selectFieldsFromSub :: forall d f. Record f -> Subquery d -> SelectQ d

foreign import selectDistinctFields :: forall d cols f. Record f -> Table d cols -> SelectQ d

foreign import innerJoin :: forall d cols. Table d cols -> SQL -> SelectQ d -> SelectQ d
foreign import leftJoin :: forall d cols. Table d cols -> SQL -> SelectQ d -> SelectQ d
foreign import innerJoinSub :: forall d. Subquery d -> SQL -> SelectQ d -> SelectQ d
foreign import leftJoinSub :: forall d. Subquery d -> SQL -> SelectQ d -> SelectQ d

foreign import whereImpl :: forall d. SQL -> SelectQ d -> SelectQ d

instance Filterable (SelectQ d) where
  where_ = whereImpl

foreign import groupBy :: forall d. Array SQL -> SelectQ d -> SelectQ d
foreign import having :: forall d. SQL -> SelectQ d -> SelectQ d
foreign import orderBy :: forall d. Array SQL -> SelectQ d -> SelectQ d
foreign import limit :: forall d. Int -> SelectQ d -> SelectQ d
foreign import offset :: forall d. Int -> SelectQ d -> SelectQ d

-- | `.as("name")`: turn a select into a subquery.
foreign import asImpl :: forall d. Database d -> String -> SelectQ d -> Subquery d

as :: forall d. Database d -> String -> SelectQ d -> Subquery d
as = asImpl

-- | A subquery as an expression: `inQuery col (subquerySQL sq)`.
subquerySQL :: forall d. Subquery d -> SQL
subquerySQL = unsafeCoerce

-- | The subquery's selected fields, for conditions and projections:
-- | `(subqueryColumns sq).playCount`. Unchecked; the record type is the
-- | caller's claim about the projection it built.
subqueryColumns :: forall d r. Subquery d -> Record r
subqueryColumns = unsafeCoerce

-- | `aliasedTable(table, "name")`: the same table under another name, for
-- | self-joins.
foreign import aliasTable :: forall d cols. Table d cols -> String -> Table d cols

foreign import runImpl :: forall d. Database d -> SelectQ d -> Effect (Promise (Array Foreign))

run :: forall d r. Database d -> SelectQ d -> Aff (Array (Record r))
run db q = unsafeCoerce <$> toAffE (runImpl db q)

runOne :: forall d r. Database d -> SelectQ d -> Aff (Maybe (Record r))
runOne db q = head <$> run db q

runForeign :: forall d. Database d -> SelectQ d -> Aff (Array Foreign)
runForeign db q = toAffE (runImpl db q)

foreign import toQuery :: forall d. Database d -> SelectQ d -> Query

-- Insert ---------------------------------------------------------------------

foreign import data InsertQ :: Dialect -> Type

foreign import insertImpl :: forall d cols. Table d cols -> Array Foreign -> InsertQ d

-- | Typed rows: a subset of the table's columns, as in `Drizzle.Query.insert`.
insert
  :: forall d cols r i
   . TableRow cols r
  => SubRow i r
  => Table d cols
  -> Array (Record i)
  -> InsertQ d
insert t rows = insertImpl t (unsafeCoerce rows)

-- | Rows whose shape is only known at runtime.
insertForeign :: forall d cols. Table d cols -> Array Foreign -> InsertQ d
insertForeign = insertImpl

foreign import onConflictDoNothing :: forall d. InsertQ d -> InsertQ d
foreign import onConflictDoNothingOn :: forall d. Array SQL -> InsertQ d -> InsertQ d

foreign import onConflictDoUpdateImpl :: forall d. Array SQL -> Foreign -> Nullable SQL -> InsertQ d -> InsertQ d

-- | `.onConflictDoUpdate({ target, set, where })`.
onConflictDoUpdate :: forall d s. { target :: Array SQL, set :: Record s, where_ :: Maybe SQL } -> InsertQ d -> InsertQ d
onConflictDoUpdate o = onConflictDoUpdateImpl o.target (unsafeCoerce o.set) (toNullable o.where_)

foreign import runInsertImpl :: forall d. Database d -> InsertQ d -> Effect (Promise Unit)
foreign import runInsertReturningImpl :: forall d. Database d -> InsertQ d -> Effect (Promise (Array Foreign))

runInsert :: forall d. Database d -> InsertQ d -> Aff Unit
runInsert db q = toAffE (runInsertImpl db q)

runInsertReturning :: forall d r. Database d -> InsertQ d -> Aff (Array (Record r))
runInsertReturning db q = unsafeCoerce <$> toAffE (runInsertReturningImpl db q)

-- Update ---------------------------------------------------------------------

foreign import data UpdateQ :: Dialect -> Type

foreign import updateImpl :: forall d cols. Table d cols -> Foreign -> UpdateQ d

update
  :: forall d cols r i
   . TableRow cols r
  => SubRow i r
  => Table d cols
  -> Record i
  -> UpdateQ d
update t changes = updateImpl t (unsafeCoerce changes)

updateForeign :: forall d cols. Table d cols -> Foreign -> UpdateQ d
updateForeign = updateImpl

foreign import updateWhereImpl :: forall d. SQL -> UpdateQ d -> UpdateQ d

instance Filterable (UpdateQ d) where
  where_ = updateWhereImpl

foreign import runUpdateImpl :: forall d. Database d -> UpdateQ d -> Effect (Promise Unit)
foreign import runUpdateReturningImpl :: forall d. Database d -> UpdateQ d -> Effect (Promise (Array Foreign))

runUpdate :: forall d. Database d -> UpdateQ d -> Aff Unit
runUpdate db q = toAffE (runUpdateImpl db q)

runUpdateReturning :: forall d r. Database d -> UpdateQ d -> Aff (Array (Record r))
runUpdateReturning db q = unsafeCoerce <$> toAffE (runUpdateReturningImpl db q)

-- Delete ---------------------------------------------------------------------

foreign import data DeleteQ :: Dialect -> Type

foreign import deleteFrom :: forall d cols. Table d cols -> DeleteQ d

foreign import deleteWhereImpl :: forall d. SQL -> DeleteQ d -> DeleteQ d

instance Filterable (DeleteQ d) where
  where_ = deleteWhereImpl

foreign import runDeleteImpl :: forall d. Database d -> DeleteQ d -> Effect (Promise Unit)
foreign import runDeleteReturningImpl :: forall d. Database d -> DeleteQ d -> Effect (Promise (Array Foreign))

runDelete :: forall d. Database d -> DeleteQ d -> Aff Unit
runDelete db q = toAffE (runDeleteImpl db q)

runDeleteReturning :: forall d r. Database d -> DeleteQ d -> Aff (Array (Record r))
runDeleteReturning db q = unsafeCoerce <$> toAffE (runDeleteReturningImpl db q)

-- | Build the parameterized SQL tree without executing the query.
foreign import querySQL :: forall d. Database d -> SelectQ d -> SQL

-- Preserve JavaScript safe-integer offsets beyond PureScript Int range.
foreign import offsetNumber :: forall d. Number -> SelectQ d -> SelectQ d

foreign import limitNumber :: forall d. Number -> SelectQ d -> SelectQ d
