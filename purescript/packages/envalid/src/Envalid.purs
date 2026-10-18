-- | Bindings for `envalid`'s `cleanEnv`. Build a spec record with the
-- | validators below, then `cleanEnv spec` returns the validated record.
-- | Validators are typed by what they produce, so the result record's types
-- | follow the spec: `{ PORT: port { default: Just 8000 } }` gives
-- | `{ PORT :: Int }`.
module Envalid
  ( Validator
  , class Spec
  , class SpecList
  , cleanEnv
  , str
  , strChoices
  , num
  , bool
  , port
  , host
  , url
  , email
  , json
  , StrOptions
  , NumOptions
  , BoolOptions
  , defaults
  ) where

import Prelude

import Data.Maybe (Maybe(..))
import Data.Nullable (Nullable, toNullable)
import Effect (Effect)
import Foreign (Foreign)
import Prim.RowList (class RowToList, RowList, Cons, Nil)
import Prim.Row as Row
import Unsafe.Coerce (unsafeCoerce)

-- | A field validator producing a value of type `a`.
foreign import data Validator :: Type -> Type

type StrOptions = { default :: Maybe String, devDefault :: Maybe String, desc :: Maybe String }
type NumOptions = { default :: Maybe Number, devDefault :: Maybe Number, desc :: Maybe String }
type BoolOptions = { default :: Maybe Boolean, devDefault :: Maybe Boolean, desc :: Maybe String }

-- | No default, no devDefault: the variable is required.
defaults :: forall a. { default :: Maybe a, devDefault :: Maybe a, desc :: Maybe String }
defaults = { default: Nothing, devDefault: Nothing, desc: Nothing }

type RawOpts a = { default :: Nullable a, devDefault :: Nullable a, desc :: Nullable String, choices :: Nullable (Array String) }

toRaw :: forall a. { default :: Maybe a, devDefault :: Maybe a, desc :: Maybe String } -> RawOpts a
toRaw o = { default: toNullable o.default, devDefault: toNullable o.devDefault, desc: toNullable o.desc, choices: toNullable Nothing }

foreign import strImpl :: RawOpts String -> Validator String
foreign import numImpl :: RawOpts Number -> Validator Number
foreign import boolImpl :: RawOpts Boolean -> Validator Boolean
foreign import portImpl :: RawOpts Int -> Validator Int
foreign import hostImpl :: RawOpts String -> Validator String
foreign import urlImpl :: RawOpts String -> Validator String
foreign import emailImpl :: RawOpts String -> Validator String
foreign import jsonImpl :: RawOpts Foreign -> Validator Foreign

str :: StrOptions -> Validator String
str = strImpl <<< toRaw

-- | `str({ choices })`.
strChoices :: Array String -> StrOptions -> Validator String
strChoices cs o = strImpl (toRaw o) { choices = toNullable (Just cs) }

num :: NumOptions -> Validator Number
num = numImpl <<< toRaw

bool :: BoolOptions -> Validator Boolean
bool = boolImpl <<< toRaw

port :: { default :: Maybe Int, devDefault :: Maybe Int, desc :: Maybe String } -> Validator Int
port = portImpl <<< toRaw

host :: StrOptions -> Validator String
host = hostImpl <<< toRaw

url :: StrOptions -> Validator String
url = urlImpl <<< toRaw

email :: StrOptions -> Validator String
email = emailImpl <<< toRaw

json :: { default :: Maybe Foreign, devDefault :: Maybe Foreign, desc :: Maybe String } -> Validator Foreign
json = jsonImpl <<< toRaw

-- | Maps a row of `Validator a` to a row of `a`.
class Spec (spec :: Row Type) (out :: Row Type) | spec -> out

instance (RowToList spec sl, SpecList sl out) => Spec spec out

class SpecList (sl :: RowList Type) (out :: Row Type) | sl -> out

instance SpecList Nil ()

instance (SpecList tail out', Row.Cons sym a out' out) => SpecList (Cons sym (Validator a) tail) out

foreign import cleanEnvImpl :: forall spec. Record spec -> Effect Foreign

-- | `cleanEnv(process.env, spec)`. Exits the process with a report when a
-- | required variable is missing or malformed, as envalid does.
cleanEnv :: forall spec out. Spec spec out => Record spec -> Effect (Record out)
cleanEnv spec = unsafeCoerce <$> cleanEnvImpl spec
