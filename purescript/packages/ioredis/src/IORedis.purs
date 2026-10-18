-- | Bindings for `ioredis`, only as far as `redlock` needs a client.
module IORedis (Redis, create, quit) where

import Prelude

import Control.Promise (Promise, toAffE)
import Effect (Effect)
import Effect.Aff (Aff)

foreign import data Redis :: Type

-- | `new Redis(url)`.
foreign import create :: String -> Effect Redis

foreign import quitImpl :: Redis -> Effect (Promise Unit)

quit :: Redis -> Aff Unit
quit r = toAffE (quitImpl r)
