module Rocksky.Lib.Rsql where

import Prelude
import Atproto.XrpcServer (invalidRequestNamedError)
import Control.Monad.Except (ExceptT, runExceptT, throwError)
import Control.Monad.Trans.Class (lift)
import Data.Array (sort)
import Data.Either (Either(..), either)
import Data.Int as Int
import Data.JSDate as Date
import Data.Maybe (Maybe(..))
import Data.Number as Number
import Data.String (Pattern(..), Replacement(..), contains, joinWith, replaceAll, trim)
import Data.String.CodeUnits as CU
import Data.Traversable (traverse)
import Drizzle.SQL (SQL)
import Drizzle.SQL as SQL
import Effect (Effect)
import Effect.Aff as Aff
import Effect.Class (liftEffect)
import Foreign.Object (Object)
import Foreign.Object as Object
import Rocksky.Lib.Matching (matches)
import Rsql as Rsql

data RsqlFieldType = StringField | NumberField | DateField | StringArrayField
derive instance Eq RsqlFieldType

type RsqlField = { column :: SQL, type_ :: RsqlFieldType }
type RsqlFieldMap = Object RsqlField

newtype RsqlFilterError = RsqlFilterError String
derive newtype instance Show RsqlFilterError
derive newtype instance Eq RsqlFilterError

field :: SQL -> RsqlField
field column = { column, type_: StringField }

fail :: forall a. String -> ExceptT RsqlFilterError Effect a
fail = throwError <<< RsqlFilterError

compileRsqlFilter :: String -> RsqlFieldMap -> Effect (Either RsqlFilterError SQL)
compileRsqlFilter filter fields = runExceptT do
  ast <- case Rsql.parse filter of
    Left message -> fail ("Invalid RSQL filter: " <> message)
    Right ast -> pure ast
  compileNode ast fields

compileRsqlFilterParam :: Maybe String -> RsqlFieldMap -> Aff.Aff (Maybe SQL)
compileRsqlFilterParam filter fields = case filter of
  Nothing -> pure Nothing
  Just value | trim value == "" -> pure Nothing
  Just value -> do
    result <- liftEffect (compileRsqlFilter value fields)
    case result of
      Left (RsqlFilterError message) -> Aff.throwError (invalidRequestNamedError message "InvalidFilter")
      Right condition -> pure (Just condition)

rsqlSelectors :: Maybe String -> Array String
rsqlSelectors filter = case filter of
  Nothing -> []
  Just value | trim value == "" -> []
  Just value -> either (const []) Rsql.selectors (Rsql.parse value)

compileNode :: Rsql.Expression -> RsqlFieldMap -> ExceptT RsqlFilterError Effect SQL
compileNode expression fields = case expression of
  Rsql.Logic op left right -> do
    a <- compileNode left fields
    b <- compileNode right fields
    pure (if op == Rsql.And then SQL.and a b else SQL.or a b)
  Rsql.Comparison node -> do
    f <- case Object.lookup node.selector fields of
      Nothing -> fail ("Unknown filter field \"" <> node.selector <> "\". Allowed fields: " <> joinWith ", " (sort (Object.keys fields)))
      Just f -> pure f
    compileComparison node f

compileComparison :: Rsql.Comparison -> RsqlField -> ExceptT RsqlFilterError Effect SQL
compileComparison node f = case node.operator of
  Rsql.Eq -> equality false
  Rsql.Ne -> equality true
  Rsql.Gt -> compare SQL.gt
  Rsql.Ge -> compare SQL.gte
  Rsql.Lt -> compare SQL.lt
  Rsql.Le -> compare SQL.lte
  Rsql.In -> membership false
  Rsql.Out -> membership true
  Rsql.Other op -> fail ("Unsupported filter operator \"" <> op <> "\" on field \"" <> node.selector <> "\"")
  where
  single = case Rsql.singleValue node.value of
    Just value -> pure value
    Nothing -> fail "The \"comparison\" passed to the \"getSingleValue\" function has to contain string value, but contains an array."
  negateIf negated condition = if negated then SQL.not condition else condition
  compare op = do
    value <- single >>= \s -> coerceValue s f.type_ node.selector
    pure (op f.column value)
  equality negated = do
    raw <- single
    if raw == "null" then pure (if negated then SQL.isNotNull f.column else SQL.isNull f.column)
    else if f.type_ == StringArrayField then pure (negateIf negated (SQL.template ["", " @> ARRAY[", "]::text[]"] [f.column, SQL.string raw]))
    else if f.type_ == StringField && contains (Pattern "*") raw then do
      let pattern = raw
            # replaceAll (Pattern "\\") (Replacement "\\\\")
            # replaceAll (Pattern "%") (Replacement "\\%")
            # replaceAll (Pattern "_") (Replacement "\\_")
            # replaceAll (Pattern "*") (Replacement "%")
      pure (negateIf negated (SQL.template ["lower(", ") LIKE lower(", ")"] [f.column, SQL.string pattern]))
    else do
      value <- coerceValue raw f.type_ node.selector
      pure (if negated then SQL.ne f.column value else SQL.eq f.column value)
  membership negated = do
    values <- case node.value of
      Rsql.Multi values -> pure values
      _ -> fail "The \"comparison\" passed to the \"getMultiValue\" function has to contain array value, but contains a single string."
    if f.type_ == StringArrayField then
      pure (negateIf negated (SQL.template ["", " && ARRAY[", "]::text[]"] [f.column, SQL.join (SQL.raw ", ") (map SQL.string values)]))
    else do
      coerced <- traverse (\s -> coerceValue s f.type_ node.selector) values
      pure (if negated then SQL.notInArray f.column coerced else SQL.inArray f.column coerced)

numberValue :: String -> Maybe Number
numberValue raw
  | trim raw == "" = Just 0.0
  | matches "^0[xX][a-fA-F0-9]+$" (trim raw) = numberBase raw 16
  | matches "^0[bB][01]+$" (trim raw) = numberBase raw 2
  | matches "^0[oO][0-7]+$" (trim raw) = numberBase raw 8
  | matches "^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)([eE][+-]?[0-9]+)?$" (trim raw) = Number.fromString raw
  | otherwise = Nothing

-- Accumulate into Number, avoiding the 32-bit range of Int.fromString.
numberBase :: String -> Int -> Maybe Number
numberBase raw radix = foldDigits 0.0 (CU.drop 2 (trim raw))
  where
  foldDigits n chars = case CU.uncons chars of
    Nothing -> if Number.isFinite n then Just n else Nothing
    Just { head, tail } -> do
      digit <- Int.fromStringAs Int.hexadecimal (CU.singleton head)
      foldDigits (n * Int.toNumber radix + Int.toNumber digit) tail

coerceValue :: String -> RsqlFieldType -> String -> ExceptT RsqlFilterError Effect SQL
coerceValue value type_ selector = case type_ of
  NumberField -> case numberValue value of
    Just n | Number.isFinite n -> pure (SQL.number n)
    _ -> fail ("Field \"" <> selector <> "\" expects a number, got \"" <> value <> "\"")
  DateField -> do
    date <- lift (Date.parse value)
    if Number.isNaN (Date.getTime date)
      then fail ("Field \"" <> selector <> "\" expects a date (e.g. 2025-01-01 or ISO datetime), got \"" <> value <> "\"")
      else pure (SQL.date date)
  StringArrayField -> fail ("Field \"" <> selector <> "\" is an array and only supports ==, !=, =in= and =out=")
  StringField -> pure (SQL.string value)
