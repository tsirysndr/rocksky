-- | Registers all currently ported XRPC methods.
module Rocksky.Xrpc.Index (register) where

import Prelude

import Effect (Effect)
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Xrpc.Groups.Actor as Actor
import Rocksky.Xrpc.Groups.Album as Album
import Rocksky.Xrpc.Groups.Apikey as Apikey
import Rocksky.Xrpc.Groups.Artist as Artist
import Rocksky.Xrpc.Groups.Charts as Charts
import Rocksky.Xrpc.Groups.Dropbox as Dropbox
import Rocksky.Xrpc.Groups.Equalizer as Equalizer
import Rocksky.Xrpc.Groups.Event as Event
import Rocksky.Xrpc.Groups.Feed as Feed
import Rocksky.Xrpc.Groups.Googledrive as Googledrive
import Rocksky.Xrpc.Groups.Graph as Graph
import Rocksky.Xrpc.Groups.Library as Library
import Rocksky.Xrpc.Groups.Like as Like
import Rocksky.Xrpc.Groups.Mirror as Mirror
import Rocksky.Xrpc.Groups.Notification as Notification
import Rocksky.Xrpc.Groups.Player as Player
import Rocksky.Xrpc.Groups.Playlist as Playlist
import Rocksky.Xrpc.Groups.Rockbox as Rockbox
import Rocksky.Xrpc.Groups.Scrobble as Scrobble
import Rocksky.Xrpc.Groups.Shout as Shout
import Rocksky.Xrpc.Groups.Song as Song
import Rocksky.Xrpc.Groups.Spotify as Spotify
import Rocksky.Xrpc.Groups.Stats as Stats

register :: Server -> Context -> Effect Unit
register server ctx = do
  Actor.register server ctx
  Album.register server ctx
  Apikey.register server ctx
  Artist.register server ctx
  Charts.register server ctx
  Dropbox.register server ctx
  Equalizer.register server ctx
  Event.register server ctx
  Feed.register server ctx
  Googledrive.register server ctx
  Graph.register server ctx
  Library.register server ctx
  Like.register server ctx
  Mirror.register server ctx
  Notification.register server ctx
  Player.register server ctx
  Playlist.register server ctx
  Rockbox.register server ctx
  Scrobble.register server ctx
  Shout.register server ctx
  Song.register server ctx
  Spotify.register server ctx
  Stats.register server ctx
