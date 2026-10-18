module Rocksky.Xrpc.Groups.Dropbox (register) where

import Prelude

import Effect (Effect)
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Xrpc.App.Rocksky.Dropbox.DownloadFile as DownloadFile
import Rocksky.Xrpc.App.Rocksky.Dropbox.GetFiles as GetFiles
import Rocksky.Xrpc.App.Rocksky.Dropbox.GetMetadata as GetMetadata
import Rocksky.Xrpc.App.Rocksky.Dropbox.GetTemporaryLink as GetTemporaryLink

register :: Server -> Context -> Effect Unit
register server ctx = do
  DownloadFile.register server ctx
  GetFiles.register server ctx
  GetMetadata.register server ctx
  GetTemporaryLink.register server ctx
