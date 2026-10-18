module Rocksky.Xrpc.Groups.Mirror (register) where

import Prelude

import Effect (Effect)
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Xrpc.App.Rocksky.Mirror.GetMirrorSources as GetMirrorSources
import Rocksky.Xrpc.App.Rocksky.Mirror.PutMirrorSource as PutMirrorSource

register :: Server -> Context -> Effect Unit
register server ctx = do
  GetMirrorSources.register server ctx
  PutMirrorSource.register server ctx
