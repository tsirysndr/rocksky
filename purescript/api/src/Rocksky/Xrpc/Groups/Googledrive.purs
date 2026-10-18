module Rocksky.Xrpc.Groups.Googledrive (register) where

import Prelude

import Effect (Effect)
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Xrpc.App.Rocksky.Googledrive.DownloadFile as DownloadFile
import Rocksky.Xrpc.App.Rocksky.Googledrive.GetFile as GetFile
import Rocksky.Xrpc.App.Rocksky.Googledrive.GetFiles as GetFiles

register :: Server -> Context -> Effect Unit
register server ctx = do
  DownloadFile.register server ctx
  GetFile.register server ctx
  GetFiles.register server ctx
