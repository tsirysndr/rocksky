module Rocksky.Xrpc.App.Rocksky.Spotify.Seek (register) where

import Prelude
import Atproto.XrpcServer as Xrpc
import Data.Maybe (Maybe(..), maybe)
import Effect (Effect)
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Lib.Aff (recoverWith, retryTransientDb, timeoutMs)
import Rocksky.Xrpc.App.Rocksky.Spotify.Control (control)
import Rocksky.Xrpc.Util as Util

register :: Server -> Context -> Effect Unit
register server ctx = Xrpc.method server "app.rocksky.spotify.seek"
  { auth: Just ctx.authVerifier
  , handler: \input -> do
      recoverWith unit (timeoutMs 10000 (retryTransientDb (control ctx (Util.authDid input) "seek" ("?position_ms=" <> maybe "undefined" show (Util.paramInt input "position")))))
      pure Xrpc.NoContent
  }
