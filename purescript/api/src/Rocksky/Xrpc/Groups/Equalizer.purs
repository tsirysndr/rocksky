module Rocksky.Xrpc.Groups.Equalizer (register) where

import Prelude

import Effect (Effect)
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Xrpc.App.Rocksky.Equalizer.DeletePreset as DeletePreset
import Rocksky.Xrpc.App.Rocksky.Equalizer.ListPresets as ListPresets
import Rocksky.Xrpc.App.Rocksky.Equalizer.PutPreset as PutPreset

register :: Server -> Context -> Effect Unit
register server ctx = do
  DeletePreset.register server ctx
  ListPresets.register server ctx
  PutPreset.register server ctx
