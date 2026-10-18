module Rocksky.Xrpc.Groups.Playlist (register) where

import Prelude

import Effect (Effect)
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Xrpc.App.Rocksky.Playlist.AddSongs as AddSongs
import Rocksky.Xrpc.App.Rocksky.Playlist.CreatePlaylist as CreatePlaylist
import Rocksky.Xrpc.App.Rocksky.Playlist.GetPlaylist as GetPlaylist
import Rocksky.Xrpc.App.Rocksky.Playlist.GetPlaylists as GetPlaylists
import Rocksky.Xrpc.App.Rocksky.Playlist.InsertDirectory as InsertDirectory
import Rocksky.Xrpc.App.Rocksky.Playlist.InsertFiles as InsertFiles
import Rocksky.Xrpc.App.Rocksky.Playlist.RemovePlaylist as RemovePlaylist
import Rocksky.Xrpc.App.Rocksky.Playlist.RemoveTrack as RemoveTrack
import Rocksky.Xrpc.App.Rocksky.Playlist.StartPlaylist as StartPlaylist
import Rocksky.Xrpc.App.Rocksky.Playlist.UpdatePlaylist as UpdatePlaylist

register :: Server -> Context -> Effect Unit
register server ctx = do
  AddSongs.register server ctx
  CreatePlaylist.register server ctx
  GetPlaylist.register server ctx
  GetPlaylists.register server ctx
  InsertDirectory.register server ctx
  InsertFiles.register server ctx
  RemovePlaylist.register server ctx
  RemoveTrack.register server ctx
  StartPlaylist.register server ctx
  UpdatePlaylist.register server ctx
