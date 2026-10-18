module Rocksky.Xrpc.Groups.Shout (register) where

import Prelude

import Effect (Effect)
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Xrpc.App.Rocksky.Shout.CreateShout as CreateShout
import Rocksky.Xrpc.App.Rocksky.Shout.GetAlbumShouts as GetAlbumShouts
import Rocksky.Xrpc.App.Rocksky.Shout.GetArtistShouts as GetArtistShouts
import Rocksky.Xrpc.App.Rocksky.Shout.GetProfileShouts as GetProfileShouts
import Rocksky.Xrpc.App.Rocksky.Shout.GetShoutReplies as GetShoutReplies
import Rocksky.Xrpc.App.Rocksky.Shout.GetTrackShouts as GetTrackShouts
import Rocksky.Xrpc.App.Rocksky.Shout.RemoveShout as RemoveShout
import Rocksky.Xrpc.App.Rocksky.Shout.ReplyShout as ReplyShout
import Rocksky.Xrpc.App.Rocksky.Shout.ReportShout as ReportShout

register :: Server -> Context -> Effect Unit
register server ctx = do
  CreateShout.register server ctx
  GetAlbumShouts.register server ctx
  GetArtistShouts.register server ctx
  GetProfileShouts.register server ctx
  GetShoutReplies.register server ctx
  GetTrackShouts.register server ctx
  RemoveShout.register server ctx
  ReplyShout.register server ctx
  ReportShout.register server ctx
