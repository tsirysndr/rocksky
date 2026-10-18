module Rocksky.Xrpc.Groups.Like (register) where

import Prelude

import Effect (Effect)
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Xrpc.App.Rocksky.Like.DislikeShout as DislikeShout
import Rocksky.Xrpc.App.Rocksky.Like.DislikeSong as DislikeSong
import Rocksky.Xrpc.App.Rocksky.Like.LikeShout as LikeShout
import Rocksky.Xrpc.App.Rocksky.Like.LikeSong as LikeSong

register :: Server -> Context -> Effect Unit
register server ctx = do
  DislikeShout.register server ctx
  DislikeSong.register server ctx
  LikeShout.register server ctx
  LikeSong.register server ctx
