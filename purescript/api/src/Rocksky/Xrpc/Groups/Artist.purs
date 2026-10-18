module Rocksky.Xrpc.Groups.Artist (register) where

import Prelude

import Effect (Effect)
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Xrpc.App.Rocksky.Artist.GetArtist as GetArtist
import Rocksky.Xrpc.App.Rocksky.Artist.GetArtistAlbums as GetArtistAlbums
import Rocksky.Xrpc.App.Rocksky.Artist.GetArtistEvents as GetArtistEvents
import Rocksky.Xrpc.App.Rocksky.Artist.GetArtistListeners as GetArtistListeners
import Rocksky.Xrpc.App.Rocksky.Artist.GetArtistRecentListeners as GetArtistRecentListeners
import Rocksky.Xrpc.App.Rocksky.Artist.GetArtistTracks as GetArtistTracks
import Rocksky.Xrpc.App.Rocksky.Artist.GetArtists as GetArtists

register :: Server -> Context -> Effect Unit
register server ctx = do
  GetArtist.register server ctx
  GetArtistAlbums.register server ctx
  GetArtistEvents.register server ctx
  GetArtistListeners.register server ctx
  GetArtistRecentListeners.register server ctx
  GetArtistTracks.register server ctx
  GetArtists.register server ctx
