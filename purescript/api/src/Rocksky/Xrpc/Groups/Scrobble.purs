module Rocksky.Xrpc.Groups.Scrobble (register) where

import Prelude

import Effect (Effect)
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Xrpc.App.Rocksky.Scrobble.CreateScrobble as CreateScrobble
import Rocksky.Xrpc.App.Rocksky.Scrobble.GetScrobble as GetScrobble
import Rocksky.Xrpc.App.Rocksky.Scrobble.GetScrobbles as GetScrobbles

register :: Server -> Context -> Effect Unit
register server ctx = do
  CreateScrobble.register server ctx
  GetScrobble.register server ctx
  GetScrobbles.register server ctx
