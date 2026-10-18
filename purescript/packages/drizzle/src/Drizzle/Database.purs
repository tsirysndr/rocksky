module Drizzle.Database
  ( Database
  , execute
  , executeResult
  , executeRows
  , transaction
  ) where

import Prelude

import Control.Promise (Promise, toAffE, fromAff)
import Drizzle.Dialect (Dialect)
import Drizzle.SQL (SQL)
import Effect (Effect)
import Effect.Aff (Aff)
import Effect.Uncurried (EffectFn1, EffectFn2, mkEffectFn1, runEffectFn2)
import Foreign (Foreign)

-- | A connected drizzle database of dialect `d`, whatever the driver. Also the
-- | type of the transaction handle passed to `transaction`'s callback.
foreign import data Database :: Dialect -> Type

foreign import executeImpl :: forall d. Database d -> SQL -> Effect (Promise Unit)

-- | Run an arbitrary statement, e.g. `execute db (raw "create table ...")`.
execute :: forall d. Database d -> SQL -> Aff Unit
execute db q = toAffE (executeImpl db q)

foreign import executeRowsImpl :: forall d. Database d -> SQL -> Effect (Promise (Array Foreign))

-- | Run a statement and return its rows (`db.execute(sql).rows` on Postgres,
-- | the result array on SQLite/MySQL).
executeRows :: forall d. Database d -> SQL -> Aff (Array Foreign)
executeRows db q = toAffE (executeRowsImpl db q)

foreign import transactionImpl
  :: forall d a. EffectFn2 (Database d) (EffectFn1 (Database d) (Promise a)) (Promise a)

-- | `db.transaction(async tx => ...)`. The callback's `Database` is the
-- | transaction; a thrown error rolls back.
transaction :: forall d a. Database d -> (Database d -> Aff a) -> Aff a
transaction db f = toAffE (runEffectFn2 transactionImpl db (mkEffectFn1 \tx -> fromAff (f tx)))

foreign import executeResultImpl :: forall d. Database d -> SQL -> Effect (Promise Foreign)
executeResult :: forall d. Database d -> SQL -> Aff Foreign
executeResult db q = toAffE (executeResultImpl db q)
