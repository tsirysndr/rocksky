-- | app.rocksky.library.getAlbumInfo
module Rocksky.Xrpc.App.Rocksky.Library.GetAlbumInfo (register) where

import Prelude

import Atproto.XrpcServer as Xrpc
import Effect (Effect)
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Lib.Navidrome (defaultProxyOptions, proxyMethod)

register :: Server -> Context -> Effect Unit
register server ctx =
  Xrpc.method server "app.rocksky.library.getAlbumInfo" (proxyMethod ctx "getAlbumInfo2" (defaultProxyOptions))
