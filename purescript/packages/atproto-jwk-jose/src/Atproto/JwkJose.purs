-- | Bindings for `@atproto/jwk-jose`.
module Atproto.JwkJose (fromImportable) where

import Atproto.OAuthClientNode (Key)
import Control.Promise (Promise, toAffE)
import Effect (Effect)
import Effect.Aff (Aff)

foreign import fromImportableImpl :: String -> Effect (Promise Key)

-- | `JoseKey.fromImportable(pemOrJwk)`.
fromImportable :: String -> Aff Key
fromImportable s = toAffE (fromImportableImpl s)
