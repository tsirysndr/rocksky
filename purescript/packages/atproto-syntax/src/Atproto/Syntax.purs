-- | Bindings for `@atproto/syntax`.
module Atproto.Syntax (AtUri, parseAtUri, isValidHandle) where

import Prelude

import Data.Maybe (Maybe)
import Data.Nullable (Nullable, toMaybe)

-- | A parsed `at://` URI: `{ host, collection, rkey }`. `host` is the DID
-- | or handle.
type AtUri = { host :: String, collection :: String, rkey :: String, href :: String }

foreign import parseAtUriImpl :: String -> Nullable AtUri

parseAtUri :: String -> Maybe AtUri
parseAtUri = toMaybe <<< parseAtUriImpl

foreign import isValidHandle :: String -> Boolean
