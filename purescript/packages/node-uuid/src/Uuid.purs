-- | Bindings for `uuid`.
module Uuid
  ( v4
  , v7
  , validate
  , version
  , nil
  ) where

import Effect (Effect)

-- | `v4()`: a random UUID.
foreign import v4 :: Effect String

-- | `v7()`: a time-ordered UUID.
foreign import v7 :: Effect String

-- | `validate(s)`.
foreign import validate :: String -> Boolean

-- | `version(s)`; 0 for an invalid UUID instead of throwing.
foreign import version :: String -> Int

-- | `NIL`: "00000000-0000-0000-0000-000000000000".
foreign import nil :: String
