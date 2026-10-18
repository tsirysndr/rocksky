-- | Bindings for `@rsql/parser` + `@rsql/ast`: `parse` an RSQL filter
-- | (https://github.com/jirutka/rsql-parser) into a PureScript ADT.
module Rsql
  ( Expression(..)
  , Comparison
  , ComparisonOp(..)
  , LogicOp(..)
  , Value(..)
  , parse
  , selectors
  , singleValue
  , multiValue
  , comparisonOpFromString
  , comparisonOpToString
  ) where

import Prelude

import Data.Array (nub)
import Data.Either (Either(..))
import Data.Maybe (Maybe(..))

-- | Canonical comparison operators; the verbose aliases (`=gt=` …) are
-- | folded into them at parse time. Anything else (custom `=xyz=`) is `Other`.
data ComparisonOp = Eq | Ne | Lt | Le | Gt | Ge | In | Out | Other String

derive instance Eq ComparisonOp

instance Show ComparisonOp where
  show = comparisonOpToString

comparisonOpFromString :: String -> ComparisonOp
comparisonOpFromString = case _ of
  "==" -> Eq
  "!=" -> Ne
  "<" -> Lt
  "=lt=" -> Lt
  "<=" -> Le
  "=le=" -> Le
  ">" -> Gt
  "=gt=" -> Gt
  ">=" -> Ge
  "=ge=" -> Ge
  "=in=" -> In
  "=out=" -> Out
  other -> Other other

comparisonOpToString :: ComparisonOp -> String
comparisonOpToString = case _ of
  Eq -> "=="
  Ne -> "!="
  Lt -> "<"
  Le -> "<="
  Gt -> ">"
  Ge -> ">="
  In -> "=in="
  Out -> "=out="
  Other s -> s

-- | `;`/`and` and `,`/`or`.
data LogicOp = And | Or

derive instance Eq LogicOp

instance Show LogicOp where
  show And = "and"
  show Or = "or"

-- | `Single` for `a==x`, `Multi` for `a=in=(x,y)` (`@rsql/ast`'s
-- | `getSingleValue` / `getMultiValue` distinction).
data Value = Single String | Multi (Array String)

derive instance Eq Value

instance Show Value where
  show (Single s) = "Single " <> show s
  show (Multi xs) = "Multi " <> show xs

type Comparison = { selector :: String, operator :: ComparisonOp, value :: Value }

data Expression
  = Comparison Comparison
  | Logic LogicOp Expression Expression

derive instance Eq Expression

instance Show Expression where
  show (Comparison c) = "Comparison " <> show c
  show (Logic op l r) = "Logic " <> show op <> " (" <> show l <> ") (" <> show r <> ")"

-- | The node objects `@rsql/parser` returns, re-tagged on the JS side.
foreign import data RawNode :: Type

foreign import parseImpl :: forall r. (String -> r) -> (RawNode -> r) -> String -> r
foreign import rawTag :: RawNode -> String
foreign import rawSelector :: RawNode -> String
foreign import rawOperator :: RawNode -> String
foreign import rawIsMulti :: RawNode -> Boolean
foreign import rawValues :: RawNode -> Array String
foreign import rawLeft :: RawNode -> RawNode
foreign import rawRight :: RawNode -> RawNode

-- | `parse(filter)` from `@rsql/parser`; `Left` carries the parser's message.
parse :: String -> Either String Expression
parse = parseImpl Left (Right <<< decode)

decode :: RawNode -> Expression
decode n = case rawTag n of
  "logic" -> Logic (if rawOperator n == "or" then Or else And) (decode (rawLeft n)) (decode (rawRight n))
  _ -> Comparison
    { selector: rawSelector n
    , operator: comparisonOpFromString (rawOperator n)
    , value:
        if rawIsMulti n then Multi (rawValues n)
        else Single (firstOr "" (rawValues n))
    }
  where
  firstOr d xs = case xs of
    [ x ] -> x
    _ -> d

-- | Every distinct selector the expression references, in first-seen order.
selectors :: Expression -> Array String
selectors = nub <<< go
  where
  go (Comparison c) = [ c.selector ]
  go (Logic _ l r) = go l <> go r

-- | `getSingleValue`: `Nothing` for a multi-value.
singleValue :: Value -> Maybe String
singleValue (Single s) = Just s
singleValue (Multi _) = Nothing

-- | `getMultiValue`: a single value is lifted to a one-element array.
multiValue :: Value -> Array String
multiValue (Single s) = [ s ]
multiValue (Multi xs) = xs
