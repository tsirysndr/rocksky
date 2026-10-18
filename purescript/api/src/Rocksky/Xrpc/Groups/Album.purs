module Rocksky.Xrpc.Groups.Album (register) where

import Prelude

import Effect (Effect)
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Xrpc.App.Rocksky.Album.GetAlbum as GetAlbum
import Rocksky.Xrpc.App.Rocksky.Album.GetAlbumTracks as GetAlbumTracks
import Rocksky.Xrpc.App.Rocksky.Album.GetAlbums as GetAlbums

register :: Server -> Context -> Effect Unit
register server ctx = do
  GetAlbum.register server ctx
  GetAlbumTracks.register server ctx
  GetAlbums.register server ctx
