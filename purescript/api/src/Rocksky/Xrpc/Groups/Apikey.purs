module Rocksky.Xrpc.Groups.Apikey (register) where

import Prelude

import Effect (Effect)
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Xrpc.App.Rocksky.Apikey.CreateApikey as CreateApikey
import Rocksky.Xrpc.App.Rocksky.Apikey.GetApikeys as GetApikeys
import Rocksky.Xrpc.App.Rocksky.Apikey.RemoveApikey as RemoveApikey
import Rocksky.Xrpc.App.Rocksky.Apikey.UpdateApikey as UpdateApikey

register :: Server -> Context -> Effect Unit
register server ctx = do
  CreateApikey.register server ctx
  GetApikeys.register server ctx
  RemoveApikey.register server ctx
  UpdateApikey.register server ctx
