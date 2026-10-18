module Rocksky.Xrpc.Groups.Graph (register) where

import Prelude

import Effect (Effect)
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Xrpc.App.Rocksky.Graph.FollowAccount as FollowAccount
import Rocksky.Xrpc.App.Rocksky.Graph.GetFollowers as GetFollowers
import Rocksky.Xrpc.App.Rocksky.Graph.GetFollows as GetFollows
import Rocksky.Xrpc.App.Rocksky.Graph.GetKnownFollowers as GetKnownFollowers
import Rocksky.Xrpc.App.Rocksky.Graph.UnfollowAccount as UnfollowAccount

register :: Server -> Context -> Effect Unit
register server ctx = do
  FollowAccount.register server ctx
  GetFollowers.register server ctx
  GetFollows.register server ctx
  GetKnownFollowers.register server ctx
  UnfollowAccount.register server ctx
