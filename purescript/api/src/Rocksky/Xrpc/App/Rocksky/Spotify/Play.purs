module Rocksky.Xrpc.App.Rocksky.Spotify.Play (register) where

import Prelude
import Atproto.XrpcServer as Xrpc
import Data.Maybe (Maybe(..))
import Effect (Effect)
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Lib.Aff (recoverWith, retryTransientDb, timeoutMs)
import Rocksky.Xrpc.App.Rocksky.Spotify.Control (control)
import Rocksky.Xrpc.Util as Util

register :: Server -> Context -> Effect Unit
register server ctx = Xrpc.method server "app.rocksky.spotify.play"
  { auth: Just ctx.authVerifier
  , handler: \input -> do
      recoverWith unit (timeoutMs 10000 (retryTransientDb (control ctx (Util.authDid input) "play" "")))
      pure Xrpc.NoContent
  }
