module Rocksky.Xrpc.App.Rocksky.Player.Next (register) where

import Prelude
import Atproto.XrpcServer as Xrpc
import Data.Maybe (Maybe(..))
import Effect (Effect)
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)

-- The TypeScript source has no implemented operation here. Preserve its response.
register :: Server -> Context -> Effect Unit
register server ctx = Xrpc.method server "app.rocksky.player.next"
  { auth: Just ctx.authVerifier, handler: \_ -> pure Xrpc.NoContent }
