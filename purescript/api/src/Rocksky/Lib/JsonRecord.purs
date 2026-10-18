-- | Object operations for sparse JSON patches without introducing JS business logic.
module Rocksky.Lib.JsonRecord (pick, field, nonNullField) where

import Prelude
import Data.Array (elem)
import Data.Maybe (fromMaybe)
import Foreign (Foreign)
import Foreign.Object as Object
import Rocksky.Lib.Foreign (asObject, path, toForeign, undefined)

pick :: Array String -> Foreign -> Foreign
pick keys value = toForeign (Object.filterKeys (flip elem keys) (fromMaybe Object.empty (asObject value)))

field :: String -> Foreign -> Foreign
field key value = fromMaybe undefined (asObject value >>= Object.lookup key)

nonNullField :: String -> Foreign -> Foreign -> Foreign
nonNullField key patch stored = fromMaybe (field key stored) (path key patch)
