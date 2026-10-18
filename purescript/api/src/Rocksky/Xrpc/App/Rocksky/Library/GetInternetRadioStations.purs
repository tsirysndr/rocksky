-- | app.rocksky.library.getInternetRadioStations
module Rocksky.Xrpc.App.Rocksky.Library.GetInternetRadioStations (register) where

import Prelude

import Atproto.XrpcServer as Xrpc
import Effect (Effect)
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Lib.Navidrome (defaultProxyOptions, proxyMethod)

register :: Server -> Context -> Effect Unit
register server ctx =
  Xrpc.method server "app.rocksky.library.getInternetRadioStations" (proxyMethod ctx "getInternetRadioStations" (defaultProxyOptions))
