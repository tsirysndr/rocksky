-- | Bindings for `iron-session`: `sealData` / `unsealData` (encrypted,
-- | signed, optionally expiring tokens).
module IronSession
  ( SealOptions
  , sealData
  , unsealData
  ) where

import Control.Promise (Promise, toAffE)
import Data.Nullable (Nullable)
import Effect (Effect)
import Effect.Aff (Aff)
import Foreign (Foreign)

-- | `password` must be at least 32 characters; `ttl` is seconds, null →
-- | the library default (14 days), 0 → never expires.
type SealOptions = { password :: String, ttl :: Nullable Int }

foreign import sealDataImpl :: Foreign -> SealOptions -> Effect (Promise String)

-- | `sealData(data, { password, ttl })`.
sealData :: Foreign -> SealOptions -> Aff String
sealData d o = toAffE (sealDataImpl d o)

foreign import unsealDataImpl :: String -> SealOptions -> Effect (Promise Foreign)

-- | `unsealData(seal, { password, ttl })`; resolves to `{}` for an expired
-- | or tampered seal (that is iron-session's behaviour, not an error).
unsealData :: String -> SealOptions -> Aff Foreign
unsealData s o = toAffE (unsealDataImpl s o)
