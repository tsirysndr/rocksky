module Rocksky.Xrpc.Groups.Actor (register) where

import Prelude

import Effect (Effect)
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Xrpc.App.Rocksky.Actor.GetActorAlbums as GetActorAlbums
import Rocksky.Xrpc.App.Rocksky.Actor.GetActorArtists as GetActorArtists
import Rocksky.Xrpc.App.Rocksky.Actor.GetActorCompatibility as GetActorCompatibility
import Rocksky.Xrpc.App.Rocksky.Actor.GetActorLovedSongs as GetActorLovedSongs
import Rocksky.Xrpc.App.Rocksky.Actor.GetActorNeighbours as GetActorNeighbours
import Rocksky.Xrpc.App.Rocksky.Actor.GetActorPlaylists as GetActorPlaylists
import Rocksky.Xrpc.App.Rocksky.Actor.GetActorScrobbles as GetActorScrobbles
import Rocksky.Xrpc.App.Rocksky.Actor.GetActorSongs as GetActorSongs
import Rocksky.Xrpc.App.Rocksky.Actor.GetProfile as GetProfile

register :: Server -> Context -> Effect Unit
register server ctx = do
  GetActorAlbums.register server ctx
  GetActorArtists.register server ctx
  GetActorCompatibility.register server ctx
  GetActorLovedSongs.register server ctx
  GetActorNeighbours.register server ctx
  GetActorPlaylists.register server ctx
  GetActorScrobbles.register server ctx
  GetActorSongs.register server ctx
  GetProfile.register server ctx
