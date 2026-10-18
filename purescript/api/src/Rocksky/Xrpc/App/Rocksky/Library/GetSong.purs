-- | app.rocksky.library.getSong
module Rocksky.Xrpc.App.Rocksky.Library.GetSong (register) where

import Prelude

import Atproto.XrpcServer as Xrpc
import Effect (Effect)
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Lib.Navidrome (defaultProxyOptions, proxyMethod)

register :: Server -> Context -> Effect Unit
register server ctx =
  Xrpc.method server "app.rocksky.library.getSong" (proxyMethod ctx "getSong" (defaultProxyOptions))
