module Rocksky.Xrpc.Groups.Stats (register) where

import Prelude

import Effect (Effect)
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Xrpc.App.Rocksky.Stats.GetGlobalStats as GetGlobalStats
import Rocksky.Xrpc.App.Rocksky.Stats.GetStats as GetStats
import Rocksky.Xrpc.App.Rocksky.Stats.GetWrapped as GetWrapped

register :: Server -> Context -> Effect Unit
register server ctx = do
  GetGlobalStats.register server ctx
  GetStats.register server ctx
  GetWrapped.register server ctx
