module Rocksky.Xrpc.App.Rocksky.Shout.GetShoutReplies (register) where

import Prelude
import Atproto.XrpcServer (HandlerOutput(..))
import Atproto.XrpcServer as Xrpc
import Data.Maybe (Maybe(..))
import Effect (Effect)
import Foreign (Foreign)
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Lib.Aff (recoverWith, retryTransientDb, timeoutMs)
import Rocksky.Lib.Foreign (toForeign)
import Rocksky.Xrpc.App.Rocksky.Shout.Reads as Reads

register :: Server -> Context -> Effect Unit
register server ctx = Xrpc.method server "app.rocksky.shout.getShoutReplies"
  { auth: Just ctx.authVerifier
  , handler: \input -> Json <$> recoverWith (toForeign { shouts: [] :: Array Foreign })
      (timeoutMs 10000 (retryTransientDb (Reads.replies ctx input)))
  }
