module Drizzle.SQL
  ( SQL
  , raw
  , param
  , string
  , int
  , number
  , bool
  , date
  , nullValue
  , empty
  , template
  , join
  , identifier
  , as
  , eq, ne, gt, gte, lt, lte
  , and, or, not
  , andAll, orAll
  , isNull, isNotNull
  , inArray, notInArray
  , inQuery, notInQuery
  , like, ilike, notLike, notIlike, between
  , asc, desc
  , count, countOf, countDistinct, max, min, sum, avg
  , lower, upper, coalesce
  , exists, notExists
  ) where

import Prelude hiding (eq, not, min, max, join, between)

import Data.Array (uncons)
import Data.JSDate (JSDate)
import Data.Maybe (Maybe(..))

-- | A SQL fragment, a column, a bound value or a subquery: anything drizzle
-- | accepts inside a `sql` template.
foreign import data SQL :: Type

foreign import raw :: String -> SQL

-- | A bound parameter. The value is sent to the driver, never interpolated.
-- | When compared against a column, the column's type mapping applies, so
-- | `eq (toSQL done) (param true)` works on a SQLite boolean column.
foreign import param :: forall a. a -> SQL

string :: String -> SQL
string = param

int :: Int -> SQL
int = param

number :: Number -> SQL
number = param

bool :: Boolean -> SQL
bool = param

date :: JSDate -> SQL
date = param

foreign import nullValue :: SQL

-- | `sql.empty()`: renders nothing. Useful as a fold seed.
foreign import empty :: SQL

-- | Tagged-template emulation: `template ["count(distinct ", ")"] [col]`
-- | renders `count(distinct "col")`, exactly like
-- | sql`count(distinct ${col})`. Chunk `i` of the strings sits before value
-- | `i`; there is always one more string than values (pad with "").
foreign import templateImpl :: Array String -> Array SQL -> SQL

template :: Array String -> Array SQL -> SQL
template = templateImpl

-- | `sql.join(parts, separator)`.
foreign import join :: SQL -> Array SQL -> SQL

-- | `sql.identifier(name)`: a quoted identifier.
foreign import identifier :: String -> SQL

-- | `fragment.as("alias")`: name a selected expression. Rows carry the
-- | alias as a key when the fragment is used in a projection.
foreign import as :: String -> SQL -> SQL

foreign import eq :: SQL -> SQL -> SQL
foreign import ne :: SQL -> SQL -> SQL
foreign import gt :: SQL -> SQL -> SQL
foreign import gte :: SQL -> SQL -> SQL
foreign import lt :: SQL -> SQL -> SQL
foreign import lte :: SQL -> SQL -> SQL

foreign import and :: SQL -> SQL -> SQL
foreign import or :: SQL -> SQL -> SQL
foreign import not :: SQL -> SQL

-- | `and(...)` over a list. An empty list is `Nothing`, so callers can pass
-- | the result straight to `where_` through `maybe identity where_`.
andAll :: Array SQL -> Maybe SQL
andAll xs = case uncons xs of
  Nothing -> Nothing
  Just { head, tail } -> Just (andAllImpl head tail)

orAll :: Array SQL -> Maybe SQL
orAll xs = case uncons xs of
  Nothing -> Nothing
  Just { head, tail } -> Just (orAllImpl head tail)

foreign import andAllImpl :: SQL -> Array SQL -> SQL
foreign import orAllImpl :: SQL -> Array SQL -> SQL

foreign import isNull :: SQL -> SQL
foreign import isNotNull :: SQL -> SQL
foreign import inArray :: SQL -> Array SQL -> SQL
foreign import notInArray :: SQL -> Array SQL -> SQL

-- | `inArray(col, subquery)`. The second argument is a subquery (see
-- | `Drizzle.Builder.as`) coerced to `SQL`.
foreign import inQuery :: SQL -> SQL -> SQL
foreign import notInQuery :: SQL -> SQL -> SQL

foreign import like :: SQL -> SQL -> SQL
foreign import ilike :: SQL -> SQL -> SQL
foreign import notLike :: SQL -> SQL -> SQL
foreign import notIlike :: SQL -> SQL -> SQL
foreign import between :: SQL -> SQL -> SQL -> SQL

foreign import asc :: SQL -> SQL
foreign import desc :: SQL -> SQL

-- Aggregates. Postgres returns `count(*)` as a string, which drizzle's
-- `count()` maps to a number; a bare `template` does not, so prefer these.
foreign import count :: SQL
foreign import countOf :: SQL -> SQL
foreign import countDistinct :: SQL -> SQL
foreign import max :: SQL -> SQL
foreign import min :: SQL -> SQL
foreign import sum :: SQL -> SQL
foreign import avg :: SQL -> SQL

lower :: SQL -> SQL
lower x = template [ "lower(", ")" ] [ x ]

upper :: SQL -> SQL
upper x = template [ "upper(", ")" ] [ x ]

coalesce :: SQL -> SQL -> SQL
coalesce a b = template [ "coalesce(", ", ", ")" ] [ a, b ]

-- | `exists(subquery)`; takes a `Drizzle.Builder` select coerced to `SQL`.
foreign import exists :: SQL -> SQL
foreign import notExists :: SQL -> SQL
