-- SDK operations used to implement authorization policy in PureScript.
module Atproto.OAuthClientNode.Runtime where

import Prelude
import Atproto.OAuthClientNode (Client)
import Control.Promise (Promise)
import Effect (Effect)
import Foreign (Foreign)

foreign import resolve :: Client -> String -> Foreign -> Effect (Promise { identityInfo :: Foreign, metadata :: Foreign })
foreign import generatePKCE :: Client -> Effect (Promise { verifier :: String, challenge :: String, method :: String })
foreign import generateKey :: Client -> Array String -> Effect (Promise Foreign)
foreign import generateNonce :: Client -> Effect (Promise String)
foreign import setState :: Client -> String -> Foreign -> Effect (Promise Unit)
foreign import serverFromMetadata :: Client -> Foreign -> Foreign -> Foreign -> Effect (Promise Foreign)
foreign import request :: Foreign -> String -> Foreign -> Effect (Promise Foreign)
foreign import keyset :: Client -> Foreign
foreign import listSigningKeys :: Foreign -> Array String -> Effect (Array { kid :: Foreign })
foreign import responseMode :: Client -> Foreign
foreign import installAuthorize :: Client -> (String -> Foreign -> Effect (Promise String)) -> Effect Unit
