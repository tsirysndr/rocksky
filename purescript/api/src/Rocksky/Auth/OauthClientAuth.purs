module Rocksky.Auth.OauthClientAuth (fallbackAlg, negotiateClientAuthMethod) where

import Prelude
import Atproto.OAuthClientNode.Runtime as Runtime
import Data.Array as A
import Data.Maybe (Maybe(..), fromMaybe)
import Data.String (joinWith)
import Effect (Effect)
import Effect.Exception (throw)
import Foreign (Foreign)
import Rocksky.Lib.Foreign as F

fallbackAlg :: String
fallbackAlg = "ES256"

negotiateClientAuthMethod :: Foreign -> Foreign -> Foreign -> Effect Foreign
negotiateClientAuthMethod server client keyset = do
  let
    method = fromMaybe "" (F.readStringAt "token_endpoint_auth_method" client)
    methods = fromMaybe [] (map (map F.unsafeFromForeign) (F.readArrayAt "token_endpoint_auth_methods_supported" server)) :: Array String
  if not (A.elem method methods) then throw ("The server does not support \"" <> method <> "\" authentication. Supported methods are: " <> joinWith ", " methods <> ".")
  else case method of
    "private_key_jwt" -> do
      when (F.isNullish keyset) (throw "A keyset is required for private_key_jwt")
      let algs = fromMaybe [fallbackAlg] (map (map F.unsafeFromForeign) (F.readArrayAt "token_endpoint_auth_signing_alg_values_supported" server))
      keys <- Runtime.listSigningKeys keyset algs
      case A.find (F.truthy <<< _.kid) keys of
        Just key -> pure (F.toForeign { method, kid: key.kid })
        Nothing -> throw (if A.elem fallbackAlg algs
          then "Client authentication method \"" <> method <> "\" requires at least one \"" <> fallbackAlg <> "\" signing key with a \"kid\" property"
          else "Authorization server requires \"" <> method <> "\" authentication method, but does not support \"" <> fallbackAlg <> "\" algorithm.")
    "none" -> pure (F.toForeign { method })
    _ -> throw ("The ATProto OAuth spec requires that client use either \"none\" or \"private_key_jwt\" authentication method." <>
      if method == "client_secret_basic" then " You might want to explicitly set \"token_endpoint_auth_method\" to one of those values in the client metadata document."
      else " You set \"" <> method <> "\" which is not allowed.")
