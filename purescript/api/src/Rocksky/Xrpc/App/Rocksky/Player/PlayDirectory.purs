module Rocksky.Xrpc.App.Rocksky.Player.PlayDirectory (register) where

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
import Drizzle.Database (transaction)

-- Source performs only this read; its unfinished operation adds no mutation.
register :: Server -> Context -> Effect Unit
register server ctx = Xrpc.method server "app.rocksky.player.playDirectory"
  { auth: Just ctx.authVerifier
  , handler: \_ -> do
      recoverWith unit (timeoutMs 10000 (transaction ctx.db (\tx -> void (run tx (selectFrom T.queueTracks) :: Aff (Array {})))))
      pure Xrpc.NoContent
  }
