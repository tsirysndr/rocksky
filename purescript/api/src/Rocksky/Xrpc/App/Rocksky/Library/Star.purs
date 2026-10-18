-- | app.rocksky.library.star
module Rocksky.Xrpc.App.Rocksky.Library.Star (register) where

import Prelude

import Atproto.XrpcServer as Xrpc
import Effect (Effect)
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Lib.Navidrome (defaultProxyOptions, proxyMethod)

register :: Server -> Context -> Effect Unit
register server ctx =
  Xrpc.method server "app.rocksky.library.star" (proxyMethod ctx "star" (defaultProxyOptions { source = "input" }))
