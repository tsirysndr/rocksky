module Rocksky.Xrpc.Groups.Rockbox (register) where

import Prelude

import Effect (Effect)
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Xrpc.App.Rocksky.Rockbox.GetAudioSettings as GetAudioSettings
import Rocksky.Xrpc.App.Rocksky.Rockbox.PutAudioSettings as PutAudioSettings

register :: Server -> Context -> Effect Unit
register server ctx = do
  GetAudioSettings.register server ctx
  PutAudioSettings.register server ctx
