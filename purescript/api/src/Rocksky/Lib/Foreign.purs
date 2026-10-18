-- | Working with untyped JS values: lodash-style path access, JSON, key
-- | case conversion (`deepCamelCaseKeys` / `deepSnakeCaseKeys` from lib/index.ts)
-- | and record-to-Foreign conversion for responses.
module Rocksky.Lib.Foreign
  ( truthy
  , stringValue
  , toForeign
  , unsafeFromForeign
  , undefined
  , isNullish
  , path
  , readStringAt
  , readIntAt
  , readNumberAt
  , readBooleanAt
  , readArrayAt
  , asString
  , asInt
  , asNumber
  , asBoolean
  , asArray
  , asObject
  , stringify
  , stringifyPretty
  , parseJson
  , omitNulls
  , deepCamelCaseKeys
  , deepSnakeCaseKeys
  , camelCase
  , snakeCase
  , mergeForeign
  , deleteKeys
  , coerceRecord
  ) where

import Prelude

import Control.Monad.Except (runExcept)
import Data.Array (foldl, uncons)
import Data.Array as Array
import Data.Either (Either(..), hush)
import Data.Int as Int
import Data.Maybe (Maybe(..))
import Data.String (Pattern(..), joinWith, split, toLower, toUpper)
import Data.String.CodeUnits as CU
import Data.String.Regex (Regex, match, regex)
import Data.String.Regex.Flags (global)
import Data.Tuple (Tuple(..))
import Foreign (Foreign, isArray, isNull, isUndefined, readBoolean, readNumber, readString, tagOf, unsafeToForeign)
import Foreign.Index (readProp)
import Foreign.Object (Object)
import Foreign.Object as Object
import Unsafe.Coerce (unsafeCoerce)

toForeign :: forall a. a -> Foreign
toForeign = unsafeToForeign

unsafeFromForeign :: forall a. Foreign -> a
unsafeFromForeign = unsafeCoerce

foreign import undefined :: Foreign

isNullish :: Foreign -> Boolean
isNullish v = isNull v || isUndefined v

-- | `_.get(obj, "a.b.0.c")`: `Nothing` when any step is missing or nullish.
path :: String -> Foreign -> Maybe Foreign
path p v = go (split (Pattern ".") p) v
  where
  go segs cur = case uncons segs of
    Nothing -> if isNullish cur then Nothing else Just cur
    Just { head, tail } ->
      if isNullish cur then Nothing
      else case hush (runExcept (readProp head cur)) of
        Nothing -> Nothing
        Just next -> go tail next

asString :: Foreign -> Maybe String
asString = hush <<< runExcept <<< readString

asNumber :: Foreign -> Maybe Number
asNumber = hush <<< runExcept <<< readNumber

asInt :: Foreign -> Maybe Int
asInt v = asNumber v >>= Int.fromNumber

asBoolean :: Foreign -> Maybe Boolean
asBoolean = hush <<< runExcept <<< readBoolean

asArray :: Foreign -> Maybe (Array Foreign)
asArray v = if isArray v then Just (unsafeFromForeign v) else Nothing

asObject :: Foreign -> Maybe (Object Foreign)
asObject v = if tagOf v == "Object" then Just (unsafeFromForeign v) else Nothing

readStringAt :: String -> Foreign -> Maybe String
readStringAt p v = path p v >>= asString

readIntAt :: String -> Foreign -> Maybe Int
readIntAt p v = path p v >>= asInt

readNumberAt :: String -> Foreign -> Maybe Number
readNumberAt p v = path p v >>= asNumber

readBooleanAt :: String -> Foreign -> Maybe Boolean
readBooleanAt p v = path p v >>= asBoolean

readArrayAt :: String -> Foreign -> Maybe (Array Foreign)
readArrayAt p v = path p v >>= asArray

-- | `JSON.stringify(v)`; `undefined`-valued input renders as "undefined".
foreign import stringify :: Foreign -> String

-- | `JSON.stringify(v, null, 2)`.
foreign import stringifyPretty :: Foreign -> String

foreign import parseJsonImpl :: forall a. (String -> a) -> (Foreign -> a) -> String -> a

parseJson :: String -> Either String Foreign
parseJson = parseJsonImpl Left Right

-- | Drop keys whose value is null or undefined (shallow).
omitNulls :: Foreign -> Foreign
omitNulls v = case asObject v of
  Nothing -> v
  Just o -> toForeign (Object.filter (not <<< isNullish) o)

-- | Shallow merge: keys of the second win.
mergeForeign :: Foreign -> Foreign -> Foreign
mergeForeign a b = case asObject a, asObject b of
  Just oa, Just ob -> toForeign (Object.union ob oa)
  _, Just _ -> b
  _, _ -> a

-- | `R.omit(keys, obj)`.
deleteKeys :: Array String -> Foreign -> Foreign
deleteKeys ks v = case asObject v of
  Nothing -> v
  Just o -> toForeign (foldl (flip Object.delete) o ks)

-- | Reinterpret a record type (the JS value is untouched).
coerceRecord :: forall a b. Record a -> Record b
coerceRecord = unsafeCoerce

-- Key case conversion ---------------------------------------------------------

-- lodash's word splitter for ASCII input: lower-case runs (with an optional
-- leading capital), acronym runs, lone capitals and digit runs are separate
-- words, so `sha256` → ["sha", "256"] and `snakeCase` gives "sha_256", exactly
-- as `_.snakeCase` does. Downstream NATS consumers were written against that.
wordsRegex :: Maybe Regex
wordsRegex = hush (regex "[A-Z]?[a-z]+|[A-Z]+(?![a-z])|[A-Z]|[0-9]+" global)

words :: String -> Array String
words s = case wordsRegex of
  Nothing -> [ s ]
  Just re -> case match re s of
    Nothing -> []
    Just ms -> Array.catMaybes (Array.fromFoldable ms)

capitalize :: String -> String
capitalize w = toUpper (CU.take 1 w) <> toLower (CU.drop 1 w)

camelCase :: String -> String
camelCase s = case uncons (words s) of
  Nothing -> ""
  Just { head, tail } -> toLower head <> joinWith "" (map capitalize tail)

snakeCase :: String -> String
snakeCase s = joinWith "_" (map toLower (words s))

deepMapKeys :: (String -> String) -> Foreign -> Foreign
deepMapKeys f v
  | isArray v = toForeign (map (deepMapKeys f) (unsafeFromForeign v :: Array Foreign))
  | tagOf v == "Object" =
      let
        o :: Object Foreign
        o = unsafeFromForeign v
        pairs :: Array (Tuple String Foreign)
        pairs = Object.toUnfoldable o
      in
        toForeign (Object.fromFoldable (map (\(Tuple k x) -> Tuple (f k) (deepMapKeys f x)) pairs))
  | otherwise = v

deepCamelCaseKeys :: Foreign -> Foreign
deepCamelCaseKeys = deepMapKeys camelCase

deepSnakeCaseKeys :: Foreign -> Foreign
deepSnakeCaseKeys = deepMapKeys snakeCase

-- JavaScript primitive coercions at interop boundaries.
foreign import truthy :: Foreign -> Boolean
foreign import stringValue :: Foreign -> String
