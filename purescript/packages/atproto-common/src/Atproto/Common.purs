-- | Bindings for `@atproto/common`.
module Atproto.Common (tidNextStr) where

import Effect (Effect)

-- | `TID.nextStr()`: a fresh timestamp identifier (record key).
foreign import tidNextStr :: Effect String
