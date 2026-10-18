-- | app.rocksky.library.getTopSongs
module Rocksky.Xrpc.App.Rocksky.Library.GetTopSongs (register) where

import Prelude

import Atproto.XrpcServer as Xrpc
import Effect (Effect)
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Lib.Navidrome (defaultProxyOptions, proxyMethod)

register :: Server -> Context -> Effect Unit
register server ctx =
  Xrpc.method server "app.rocksky.library.getTopSongs" (proxyMethod ctx "getTopSongs" (defaultProxyOptions))
