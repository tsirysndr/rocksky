-- | Small decoders replacing the zod schemas of `src/types/*`. Errors carry
-- | the field path and a zod-like message so the API's error strings stay the
-- | same ("albumArtist Required", "duration Expected number, received string").
module Rocksky.Lib.Validate
  ( Decoder
  , FieldError
  , decode
  , run
  , field
  , optional
  , optionalNullable
  , optionalNullablePreserve
  , nullable
  , string
  , nonEmpty
  , trimmed
  , maxLength
  , minLength
  , regexMatch
  , url
  , email
  , number
  , int
  , nonNegativeInt
  , boolean
  , array
  , object
  , mapDecoder
  , refine
  , succeed
  , fail
  , formatErrors
  , formatZodLike
  , received
  ) where

import Prelude

import Control.Monad.Except (runExcept)
import Data.Array (null)
import Data.Either (Either(..), hush)
import Data.Int as Int
import Data.Maybe (Maybe(..))
import Data.Nullable (Nullable, toNullable)
import Data.String (Pattern(..), contains, joinWith, trim)
import Data.String as String
import Data.String.Regex (Regex, regex, test)
import Data.String.Regex.Flags (noFlags)
import Data.TraversableWithIndex (traverseWithIndex)
import Data.Validation.Semigroup (V, invalid, toEither)
import Foreign (Foreign, isArray, isNull, isUndefined, readBoolean, readNumber, readString, tagOf, typeOf)
import Foreign.Index (readProp)
import Rocksky.Lib.Foreign (unsafeFromForeign, undefined)

type FieldError = { path :: String, message :: String }

-- | A decoder from a JS value at a path to `a`, accumulating errors.
newtype Decoder a = Decoder (String -> Foreign -> V (Array FieldError) a)

decode :: forall a. Decoder a -> String -> Foreign -> V (Array FieldError) a
decode (Decoder f) = f

run :: forall a. Decoder a -> Foreign -> Either (Array FieldError) a
run d v = toEither (decode d "" v)

err :: forall a. String -> String -> V (Array FieldError) a
err p m = invalid [ { path: p, message: m } ]

received :: Foreign -> String
received v
  | isNull v = "null"
  | isUndefined v = "undefined"
  | isArray v = "array"
  | otherwise = typeOf v

joinPath :: String -> String -> String
joinPath "" k = k
joinPath p k = p <> "." <> k

succeed :: forall a. a -> Decoder a
succeed a = Decoder \_ _ -> pure a

fail :: forall a. String -> Decoder a
fail m = Decoder \p _ -> err p m

instance Functor Decoder where
  map f (Decoder d) = Decoder \p v -> map f (d p v)

mapDecoder :: forall a b. (a -> b) -> Decoder a -> Decoder b
mapDecoder = map

-- | zod `.refine(pred, message)`.
refine :: forall a. (a -> Boolean) -> String -> Decoder a -> Decoder a
refine pred m (Decoder d) = Decoder \p v -> case toEither (d p v) of
  Left es -> invalid es
  Right a -> if pred a then pure a else err p m

-- | A required field: missing (undefined) is "Required".
field :: forall a. String -> Decoder a -> Foreign -> V (Array FieldError) a
field k (Decoder d) v =
  let
    p = k
    prop = hush (runExcept (readProp k v))
  in
    case prop of
      Nothing -> err p "Required"
      Just x | isUndefined x -> err p "Required"
      Just x -> d p x

-- | A field that may be absent (undefined → Nothing); null is still an error
-- | unless combined with `nullable`.
optional :: forall a. String -> Decoder a -> Foreign -> V (Array FieldError) (Maybe a)
optional k (Decoder d) v = case hush (runExcept (readProp k v)) of
  Nothing -> pure Nothing
  Just x | isUndefined x -> pure Nothing
  Just x -> Just <$> d k x

-- | zod `.optional().nullable()`: undefined or null both decode to `null`.
optionalNullable :: forall a. String -> Decoder a -> Foreign -> V (Array FieldError) (Nullable a)
optionalNullable k (Decoder d) v = case hush (runExcept (readProp k v)) of
  Nothing -> pure (toNullable Nothing)
  Just x | isUndefined x || isNull x -> pure (toNullable Nothing)
  Just x -> toNullable <<< Just <$> d k x

-- | zod `.nullable()`: null decodes to `null`, undefined is "Required".
nullable :: forall a. String -> Decoder a -> Foreign -> V (Array FieldError) (Nullable a)
nullable k (Decoder d) v = case hush (runExcept (readProp k v)) of
  Nothing -> err k "Required"
  Just x | isUndefined x -> err k "Required"
  Just x | isNull x -> pure (toNullable Nothing)
  Just x -> toNullable <<< Just <$> d k x

string :: Decoder String
string = Decoder \p v -> case hush (runExcept (readString v)) of
  Just s -> pure s
  Nothing -> err p ("Expected string, received " <> received v)

nonEmpty :: Decoder String -> Decoder String
nonEmpty = refine (_ /= "") "String must contain at least 1 character(s)"

trimmed :: Decoder String -> Decoder String
trimmed = map trim

maxLength :: Int -> Decoder String -> Decoder String
maxLength n = refine (\s -> String.length s <= n) ("String must contain at most " <> show n <> " character(s)")

minLength :: Int -> Decoder String -> Decoder String
minLength n = refine (\s -> String.length s >= n) ("String must contain at least " <> show n <> " character(s)")

regexMatch :: String -> String -> Decoder String -> Decoder String
regexMatch pattern m d = case regex pattern noFlags of
  Left _ -> d
  Right re -> refine (test re) m d

urlRegex :: Maybe Regex
urlRegex = hush (regex "^[a-zA-Z][a-zA-Z0-9+.-]*:" noFlags)

url :: Decoder String -> Decoder String
url = refine (\s -> case urlRegex of
  Just re -> test re s && not (contains (Pattern " ") s)
  Nothing -> true) "Invalid url"

emailRegex :: Maybe Regex
emailRegex = hush (regex "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$" noFlags)

email :: Decoder String -> Decoder String
email = refine (\s -> case emailRegex of
  Just re -> test re s
  Nothing -> true) "Invalid email"

number :: Decoder Number
number = Decoder \p v -> case hush (runExcept (readNumber v)) of
  Just n -> pure n
  Nothing -> err p ("Expected number, received " <> received v)

int :: Decoder Int
int = Decoder \p v -> case hush (runExcept (readNumber v)) >>= Int.fromNumber of
  Just n -> pure n
  Nothing -> err p ("Expected integer, received " <> received v)

nonNegativeInt :: Decoder Int
nonNegativeInt = refine (_ >= 0) "Number must be greater than or equal to 0" int

boolean :: Decoder Boolean
boolean = Decoder \p v -> case hush (runExcept (readBoolean v)) of
  Just b -> pure b
  Nothing -> err p ("Expected boolean, received " <> received v)

array :: forall a. Decoder a -> Decoder (Array a)
array (Decoder d) = Decoder \p v ->
  if isArray v then traverseWithIndex (\i x -> d (joinPath p (show i)) x) (unsafeFromForeign v :: Array Foreign)
  else err p ("Expected array, received " <> received v)

-- | An object decoder built from field readers. The function receives the
-- | object and the path prefix for its fields.
object :: forall a. (Foreign -> V (Array FieldError) a) -> Decoder a
object f = Decoder \p v ->
  if tagOf v == "Object" then
    case toEither (f v) of
      Right a -> pure a
      Left es -> invalid (map (\e -> e { path = joinPath p e.path }) es)
  else err p ("Expected object, received " <> received v)

-- | "field message; field message".
formatErrors :: Array FieldError -> String
formatErrors es = joinWith "; " (map (\e -> if e.path == "" then e.message else e.path <> " " <> e.message) es)

-- | zod's `error.message`: a JSON array of issues, as clients came to expect
-- | in "Invalid track data: ..." responses.
formatZodLike :: Array FieldError -> String
formatZodLike es
  | null es = "[]"
  | otherwise = "[\n" <> joinWith ",\n" (map issue es) <> "\n]"
  where
  issue e = "  {\n    \"path\": [" <> joinWith ", " (map (\s -> "\"" <> s <> "\"") (pathSegments e.path)) <> "],\n    \"message\": \"" <> e.message <> "\"\n  }"
  pathSegments "" = []
  pathSegments p = String.split (Pattern ".") p

-- Preserve JavaScript's absent/null distinction for sparse metadata updates.
optionalNullablePreserve :: forall a. String -> Decoder a -> Foreign -> V (Array FieldError) (Nullable a)
optionalNullablePreserve k (Decoder d) v = case hush (runExcept (readProp k v)) of
  Nothing -> pure (unsafeFromForeign undefined)
  Just x | isUndefined x -> pure (unsafeFromForeign undefined)
  Just x | isNull x -> pure (toNullable Nothing)
  Just x -> toNullable <<< Just <$> d k x
