module Rocksky.Auth.OauthClient (install, authorize) where

import Prelude
import Atproto.OAuthClientNode (Client, clientMetadata)
import Atproto.OAuthClientNode.Runtime as Runtime
import Control.Promise (fromAff, toAffE)
import Data.Array as A
import Data.Maybe (fromMaybe)
import Data.String.CodeUnits as CU
import Data.Traversable (traverse_)
import Data.Tuple (Tuple(..))
import Effect (Effect)
import Effect.Aff (Aff, throwError)
import Effect.Class (liftEffect)
import Effect.Exception (error)
import Fetch.URL as URL
import Foreign (Foreign)
import Foreign.Object as Object
import Rocksky.Auth.OauthClientAuth (fallbackAlg, negotiateClientAuthMethod)
import Rocksky.Lib.Foreign as F
import Rocksky.Lib.Error (typeError)

field :: String -> Foreign -> Foreign
field key = fromMaybe F.undefined <<< F.path key

install :: Client -> Effect Unit
install client = Runtime.installAuthorize client (\input options -> fromAff (authorize client input options))

authorize :: Client -> String -> Foreign -> Aff String
authorize client input supplied = do
  let
    metadata = clientMetadata client
    options = F.deleteKeys ["signal"] supplied
    redirects = fromMaybe [] (F.readArrayAt "redirect_uris" metadata)
    redirect = fromMaybe (fromMaybe F.undefined (A.head redirects)) (F.path "redirect_uri" options)
    redirectString = F.stringValue redirect
  unless (A.any (\v -> F.stringValue v == redirectString) redirects) (throwError (typeError "Invalid redirect_uri"))
  resolved <- toAffE (Runtime.resolve client input (field "signal" supplied))
  pkce <- toAffE (Runtime.generatePKCE client)
  key <- toAffE (Runtime.generateKey client (fromMaybe [fallbackAlg] (map (map F.unsafeFromForeign) (F.readArrayAt "dpop_signing_alg_values_supported" resolved.metadata))))
  authMethod <- liftEffect (negotiateClientAuthMethod resolved.metadata metadata (Runtime.keyset client))
  state <- toAffE (Runtime.generateNonce client)
  toAffE (Runtime.setState client state (F.toForeign
    { iss: field "issuer" resolved.metadata, authMethod, dpopKey: key, verifier: pkce.verifier, appState: field "state" options }))
  let parameters = F.mergeForeign options (F.toForeign
        { client_id: field "client_id" metadata, redirect_uri: redirect, code_challenge: pkce.challenge, code_challenge_method: pkce.method, state
        , login_hint: if F.truthy resolved.identityInfo && not (F.truthy (field "prompt" options)) then F.toForeign input else F.undefined
        , response_mode: Runtime.responseMode client, response_type: "code", scope: fromMaybe (field "scope" metadata) (F.path "scope" options) })
  url <- liftEffect (URL.create (F.stringValue (field "authorization_endpoint" resolved.metadata)))
  unless (A.elem (URL.protocol url) ["https:", "http:"]) (throwError (typeError ("Invalid authorization endpoint protocol: " <> URL.protocol url)))
  if F.truthy (field "pushed_authorization_request_endpoint" resolved.metadata) then do
    server <- toAffE (Runtime.serverFromMetadata client resolved.metadata authMethod key)
    response <- toAffE (Runtime.request server "pushed_authorization_request" parameters)
    liftEffect do
      URL.setParam url "client_id" (F.stringValue (field "client_id" metadata))
      URL.setParam url "request_uri" (F.stringValue (field "request_uri" response))
      URL.serialize url
  else if F.truthy (field "require_pushed_authorization_requests" resolved.metadata) then
    throwError (error "Server requires pushed authorization requests (PAR) but no PAR endpoint is available")
  else do
    let entries = Object.toUnfoldable (fromMaybe Object.empty (F.asObject parameters)) :: Array (Tuple String Foreign)
    liftEffect (traverse_ (\(Tuple k v) -> when (F.truthy v) (URL.setParam url k (F.stringValue v))) entries)
    if CU.length (URL.pathname url) + CU.length (URL.search url) < 2048 then liftEffect (URL.serialize url)
    else throwError (error "Login URL too long")
