module Rocksky.Xrpc.Groups.Song (register) where

import Prelude

import Effect (Effect)
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Xrpc.App.Rocksky.Song.CreateSong as CreateSong
import Rocksky.Xrpc.App.Rocksky.Song.GetSong as GetSong
import Rocksky.Xrpc.App.Rocksky.Song.GetSongRecentListeners as GetSongRecentListeners
import Rocksky.Xrpc.App.Rocksky.Song.GetSongs as GetSongs
import Rocksky.Xrpc.App.Rocksky.Song.MatchSong as MatchSong

register :: Server -> Context -> Effect Unit
register server ctx = do
  CreateSong.register server ctx
  GetSong.register server ctx
  GetSongRecentListeners.register server ctx
  GetSongs.register server ctx
  MatchSong.register server ctx
