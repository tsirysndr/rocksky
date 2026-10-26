module Rocksky.Internal.Encoding (omitMissing) where

import Data.Argonaut.Core (Json)

-- | Remove Nothing values only at schema-declared optional fields. Required
-- | nullable fields and arbitrary JSON payloads keep their explicit nulls.
foreign import omitMissing :: Array (Array String) -> Json -> Json
