module Rocksky.Xrpc.App.Rocksky.Dropbox.GetMetadata (register) where

import Prelude
import Atproto.XrpcServer as Xrpc
import Data.Maybe (Maybe(..))
import Effect (Effect)
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Lib.Foreign (toForeign)

-- The TypeScript source has no implemented operation here. Preserve its response.
register :: Server -> Context -> Effect Unit
register server ctx = Xrpc.method server "app.rocksky.dropbox.getMetadata"
  { auth: Just ctx.authVerifier, handler: \_ -> pure (Xrpc.Json (toForeign { metadata: {} })) }
