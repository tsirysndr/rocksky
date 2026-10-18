module Rocksky.Xrpc.Groups.Player (register) where

import Prelude

import Effect (Effect)
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Xrpc.App.Rocksky.Player.AddItemsToQueue as AddItemsToQueue
import Rocksky.Xrpc.App.Rocksky.Player.GetCurrentlyPlaying as GetCurrentlyPlaying
import Rocksky.Xrpc.App.Rocksky.Player.GetPlaybackQueue as GetPlaybackQueue
import Rocksky.Xrpc.App.Rocksky.Player.Next as Next
import Rocksky.Xrpc.App.Rocksky.Player.Pause as Pause
import Rocksky.Xrpc.App.Rocksky.Player.Play as Play
import Rocksky.Xrpc.App.Rocksky.Player.PlayDirectory as PlayDirectory
import Rocksky.Xrpc.App.Rocksky.Player.PlayFile as PlayFile
import Rocksky.Xrpc.App.Rocksky.Player.Previous as Previous
import Rocksky.Xrpc.App.Rocksky.Player.Seek as Seek

register :: Server -> Context -> Effect Unit
register server ctx = do
  AddItemsToQueue.register server ctx
  GetCurrentlyPlaying.register server ctx
  GetPlaybackQueue.register server ctx
  Next.register server ctx
  Pause.register server ctx
  Play.register server ctx
  PlayDirectory.register server ctx
  PlayFile.register server ctx
  Previous.register server ctx
  Seek.register server ctx
