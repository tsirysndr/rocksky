-- | Bindings for `jsonwebtoken`.
module Jsonwebtoken
  ( sign
  , verify
  , verifyIgnoringExpiration
  , decode
  ) where

import Prelude

import Data.Either (Either(..))
import Data.Maybe (Maybe)
import Data.Nullable (Nullable, toMaybe)
import Effect.Exception (Error, message)
import Foreign (Foreign)

-- | `jwt.sign(payload, secret)`; the payload may carry `exp`/`iat`.
foreign import sign :: Foreign -> String -> String

foreign import verifyImpl :: forall a. (Error -> a) -> (Foreign -> a) -> String -> String -> Boolean -> a

-- | `jwt.verify(token, secret)`: the payload, or the verification error.
verify :: String -> String -> Either String Foreign
verify token secret = verifyImpl (Left <<< message) Right token secret false

-- | `jwt.verify(token, secret, { ignoreExpiration: true })`.
verifyIgnoringExpiration :: String -> String -> Either String Foreign
verifyIgnoringExpiration token secret = verifyImpl (Left <<< message) Right token secret true

foreign import decodeImpl :: String -> Nullable Foreign

-- | `jwt.decode(token)` without verification.
decode :: String -> Maybe Foreign
decode = toMaybe <<< decodeImpl
