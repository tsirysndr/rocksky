module Rocksky.Xrpc.App.Rocksky.Shout.RemoveShout (register) where

import Prelude
import Atproto.XrpcServer (HandlerOutput(..))
import Atproto.XrpcServer as Xrpc
import Data.Maybe (Maybe(..))
import Effect (Effect)
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Lib.Aff (recoverWith, timeoutMs)
import Rocksky.Lib.Foreign (toForeign)
import Rocksky.Xrpc.App.Rocksky.Shout.Mutations as Mutations
import Rocksky.Xrpc.App.Rocksky.Shout.Util (wrapFailure)

register :: Server -> Context -> Effect Unit
register server ctx = Xrpc.method server "app.rocksky.shout.removeShout"
  { auth: Just ctx.authVerifier
  , handler: \input -> do
      recoverWith unit (timeoutMs 15000 (wrapFailure "Failed to remove shout" (Mutations.remove ctx input)))
      pure (Json (toForeign {}))
  }
