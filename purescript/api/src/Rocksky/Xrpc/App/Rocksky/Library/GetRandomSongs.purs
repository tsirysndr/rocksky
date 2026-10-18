-- | app.rocksky.library.getRandomSongs
module Rocksky.Xrpc.App.Rocksky.Library.GetRandomSongs (register) where

import Prelude

import Atproto.XrpcServer as Xrpc
import Effect (Effect)
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Lib.Navidrome (defaultProxyOptions, proxyMethod)

register :: Server -> Context -> Effect Unit
register server ctx =
  Xrpc.method server "app.rocksky.library.getRandomSongs" (proxyMethod ctx "getRandomSongs" (defaultProxyOptions))
