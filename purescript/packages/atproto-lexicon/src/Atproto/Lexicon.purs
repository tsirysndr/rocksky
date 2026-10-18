-- | Bindings for `@atproto/lexicon`: validate records and objects against
-- | loaded lexicon documents.
module Atproto.Lexicon
  ( Lexicons
  , create
  , validate
  , validateRecord
  , ValidationResult
  , isRecordOf
  ) where

import Prelude

import Data.Either (Either(..))
import Data.Nullable (Nullable, toMaybe)
import Data.Maybe (maybe)
import Foreign (Foreign)

foreign import data Lexicons :: Type

-- | `new Lexicons(docs)`.
foreign import create :: Array Foreign -> Lexicons

type ValidationResult = { success :: Boolean, error :: Nullable String }

foreign import validateImpl :: Lexicons -> String -> Foreign -> ValidationResult

-- | `lexicons.validate(lexUri, value)`; `Left message` on failure. The URI
-- | is an NSID, optionally with `#def` (defaults to `#main`).
validate :: Lexicons -> String -> Foreign -> Either String Unit
validate l uri v =
  let r = validateImpl l uri v
  in if r.success then Right unit else Left (maybe "invalid" identity (toMaybe r.error))

-- | Validate `value` as a record of collection `nsid` (its `#main` def),
-- | also requiring `$type` to match when present.
validateRecord :: Lexicons -> String -> Foreign -> Either String Unit
validateRecord l nsid v = validate l (nsid <> "#main") v

-- | `value.$type === nsid`.
foreign import isRecordOf :: String -> Foreign -> Boolean
