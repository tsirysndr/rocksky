module Rocksky.Xrpc.Groups.Charts (register) where

import Prelude

import Effect (Effect)
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Xrpc.App.Rocksky.Charts.GetDecades as GetDecades
import Rocksky.Xrpc.App.Rocksky.Charts.GetScrobblesChart as GetScrobblesChart
import Rocksky.Xrpc.App.Rocksky.Charts.GetTopArtists as GetTopArtists
import Rocksky.Xrpc.App.Rocksky.Charts.GetTopScrobblers as GetTopScrobblers
import Rocksky.Xrpc.App.Rocksky.Charts.GetTopTracks as GetTopTracks

register :: Server -> Context -> Effect Unit
register server ctx = do
  GetDecades.register server ctx
  GetScrobblesChart.register server ctx
  GetTopArtists.register server ctx
  GetTopScrobblers.register server ctx
  GetTopTracks.register server ctx
