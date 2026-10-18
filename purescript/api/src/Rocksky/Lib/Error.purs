-- | Reading the JS-side shape of errors: `code`, `name`, `cause`, the members
-- | of an `AggregateError`, and `describeError` which renders all of them.
module Rocksky.Lib.Error
  ( typeError
  , errorCode
  , errorName
  , errorField
  , describeError
  , logError
  , logErrorWith
  , errorToForeign
  , foreignToError
  , messageIncludes
  ) where

import Prelude

import Consola as Consola
import Data.Maybe (Maybe)
import Data.Nullable (Nullable, toMaybe)
import Data.String (Pattern(..), contains)
import Effect (Effect)
import Effect.Exception (Error, message)
import Foreign (Foreign)

foreign import errorCodeImpl :: Error -> Nullable String

-- | `error.code` (e.g. "SQLITE_BUSY", "ECONNRESET").
errorCode :: Error -> Maybe String
errorCode = toMaybe <<< errorCodeImpl

foreign import errorName :: Error -> String

foreign import errorFieldImpl :: Error -> String -> Nullable String

-- | A string property of the error object (e.g. `error.error` on XRPC errors).
errorField :: Error -> String -> Maybe String
errorField e k = toMaybe (errorFieldImpl e k)

-- | Renders an error with everything `consola` drops on its own: an
-- | `AggregateError`'s members and the `cause` chain under each.
foreign import describeError :: Error -> String

foreign import errorToForeign :: Error -> Foreign
foreign import foreignToError :: Foreign -> Error

logError :: Error -> Effect Unit
logError e = Consola.errorF (message e) [ errorToForeign e ]

logErrorWith :: String -> Error -> Effect Unit
logErrorWith prefix e = Consola.errorF prefix [ errorToForeign e ]

messageIncludes :: String -> Error -> Boolean
messageIncludes needle e = contains (Pattern needle) (message e)

foreign import typeError :: String -> Error
