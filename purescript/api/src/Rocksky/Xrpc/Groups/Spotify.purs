module Rocksky.Xrpc.Groups.Spotify (register) where

import Prelude

import Effect (Effect)
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Xrpc.App.Rocksky.Spotify.GetCurrentlyPlaying as GetCurrentlyPlaying
import Rocksky.Xrpc.App.Rocksky.Spotify.Next as Next
import Rocksky.Xrpc.App.Rocksky.Spotify.Pause as Pause
import Rocksky.Xrpc.App.Rocksky.Spotify.Play as Play
import Rocksky.Xrpc.App.Rocksky.Spotify.Previous as Previous
import Rocksky.Xrpc.App.Rocksky.Spotify.Seek as Seek

register :: Server -> Context -> Effect Unit
register server ctx = do
  GetCurrentlyPlaying.register server ctx
  Next.register server ctx
  Pause.register server ctx
  Play.register server ctx
  Previous.register server ctx
  Seek.register server ctx
