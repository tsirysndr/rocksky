module Rocksky.Xrpc.App.Rocksky.Like.DislikeSong (register) where

import Prelude
import Atproto.XrpcServer (HandlerOutput(..))
import Atproto.XrpcServer as Xrpc
import Data.Maybe (Maybe(..))
import Effect (Effect)
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Lib.Aff (recoverWith, timeoutMs)
import Rocksky.Lib.Foreign (toForeign)
import Rocksky.Xrpc.App.Rocksky.Like.Song as Song
import Rocksky.Xrpc.App.Rocksky.Shout.Util (wrapFailure)

register :: Server -> Context -> Effect Unit
register server ctx = Xrpc.method server "app.rocksky.like.dislikeSong"
  { auth: Just ctx.authVerifier
  , handler: \input -> do
      recoverWith unit (timeoutMs 10000 (wrapFailure "Failed to dislike song" (Song.mutate false ctx input)))
      pure (Json (toForeign {}))
  }
