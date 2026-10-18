module Rocksky.Xrpc.App.Rocksky.Player.GetPlaybackQueue (register) where

import Prelude
import Atproto.XrpcServer as Xrpc
import Data.Maybe (Maybe(..))
import Effect (Effect)
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Drizzle.Builder (run, selectFrom)
import Effect.Aff (Aff)
import Rocksky.Lib.Aff (recoverWith, timeoutMs)
import Rocksky.Schema as T
import Rocksky.Lib.Foreign (toForeign)

-- Source performs only this read; its unfinished operation adds no mutation.
register :: Server -> Context -> Effect Unit
register server ctx = Xrpc.method server "app.rocksky.player.getPlaybackQueue"
  { auth: Just ctx.authVerifier
  , handler: \_ -> do
      recoverWith unit (timeoutMs 10000 (void (run ctx.db (selectFrom T.queueTracks) :: Aff (Array {}))))
      pure  (Xrpc.Json (toForeign {}))
  }
