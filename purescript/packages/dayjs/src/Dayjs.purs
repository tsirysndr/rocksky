-- | Bindings for `dayjs` with the `utc` and `customParseFormat` plugins
-- | extended at module load. A `Dayjs` is immutable, so everything but `now`
-- | is pure; invalid instants are values (check `isValid`).
module Dayjs
  ( Dayjs
  , TimeUnit(..)
  , now
  , unix
  , utc
  , utcInput
  , utcFormat
  , parse
  , parseFormat
  , fromDate
  , fromMillis
  , toISOString
  , toUnix
  , valueOf
  , toDate
  , format
  , isValid
  , add
  , subtract
  , diff
  , startOf
  , endOf
  , isBefore
  , isAfter
  , isSame
  , toUtc
  , toLocal
  ) where

import Prelude

import Data.JSDate (JSDate)
import Data.Maybe (Maybe)
import Data.Nullable (Nullable, toMaybe)
import Effect (Effect)
import Foreign (Foreign)

foreign import data Dayjs :: Type

data TimeUnit
  = Millisecond
  | Second
  | Minute
  | Hour
  | Day
  | Week
  | Month
  | Year

derive instance Eq TimeUnit

unitName :: TimeUnit -> String
unitName = case _ of
  Millisecond -> "millisecond"
  Second -> "second"
  Minute -> "minute"
  Hour -> "hour"
  Day -> "day"
  Week -> "week"
  Month -> "month"
  Year -> "year"

-- | `dayjs()`.
foreign import now :: Effect Dayjs

-- | `dayjs.unix(seconds)`.
foreign import unix :: Number -> Dayjs

-- | `dayjs.utc(iso)`.
foreign import utc :: String -> Dayjs

-- | `dayjs.utc(input, format)` (customParseFormat), e.g. "YYYY-MM-DD HH:mm".
foreign import utcFormat :: String -> String -> Dayjs

-- | `dayjs(input)` in local time.
foreign import parse :: String -> Dayjs

-- | `dayjs(input, format)` in local time.
foreign import parseFormat :: String -> String -> Dayjs

-- | `dayjs(date)`.
foreign import fromDate :: JSDate -> Dayjs

-- | `dayjs(epochMillis)`.
foreign import fromMillis :: Number -> Dayjs

foreign import toISOStringImpl :: Dayjs -> Nullable String

-- | `.toISOString()`; `Nothing` for an invalid instant (where dayjs throws).
toISOString :: Dayjs -> Maybe String
toISOString = toMaybe <<< toISOStringImpl

-- | `.unix()`: whole seconds since the epoch (NaN when invalid).
foreign import toUnix :: Dayjs -> Number

-- | `.valueOf()`: epoch milliseconds (NaN when invalid).
foreign import valueOf :: Dayjs -> Number

-- | `.toDate()`.
foreign import toDate :: Dayjs -> JSDate

-- | `.format(template)`.
foreign import format :: Dayjs -> String -> String

-- | `.isValid()`.
foreign import isValid :: Dayjs -> Boolean

foreign import addImpl :: Dayjs -> Int -> String -> Dayjs

-- | `.add(n, unit)`.
add :: Dayjs -> Int -> TimeUnit -> Dayjs
add d n u = addImpl d n (unitName u)

foreign import subtractImpl :: Dayjs -> Int -> String -> Dayjs

-- | `.subtract(n, unit)`.
subtract :: Dayjs -> Int -> TimeUnit -> Dayjs
subtract d n u = subtractImpl d n (unitName u)

foreign import diffImpl :: Dayjs -> Dayjs -> String -> Number

-- | `a.diff(b, unit)` truncated toward zero, as dayjs does.
diff :: Dayjs -> Dayjs -> TimeUnit -> Number
diff a b u = diffImpl a b (unitName u)

foreign import startOfImpl :: Dayjs -> String -> Dayjs

-- | `.startOf(unit)`.
startOf :: Dayjs -> TimeUnit -> Dayjs
startOf d u = startOfImpl d (unitName u)

foreign import endOfImpl :: Dayjs -> String -> Dayjs

-- | `.endOf(unit)`.
endOf :: Dayjs -> TimeUnit -> Dayjs
endOf d u = endOfImpl d (unitName u)

-- | `a.isBefore(b)`.
foreign import isBefore :: Dayjs -> Dayjs -> Boolean

-- | `a.isAfter(b)`.
foreign import isAfter :: Dayjs -> Dayjs -> Boolean

foreign import isSameImpl :: Dayjs -> Dayjs -> String -> Boolean

-- | `a.isSame(b, unit)`.
isSame :: Dayjs -> Dayjs -> TimeUnit -> Boolean
isSame a b u = isSameImpl a b (unitName u)

-- | `.utc()`: the same instant in UTC mode (affects `format`/`startOf`).
foreign import toUtc :: Dayjs -> Dayjs

-- | `.local()`.
foreign import toLocal :: Dayjs -> Dayjs

-- | UTC parsing of arbitrary JS input; undefined means the current instant.
foreign import utcInput :: Foreign -> Nullable String -> Effect Dayjs
