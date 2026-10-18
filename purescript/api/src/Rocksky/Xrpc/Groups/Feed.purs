module Rocksky.Xrpc.Groups.Feed (register) where

import Prelude

import Effect (Effect)
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Xrpc.App.Rocksky.Feed.GetAlbumRecommendations as GetAlbumRecommendations
import Rocksky.Xrpc.App.Rocksky.Feed.GetArtistRecommendations as GetArtistRecommendations
import Rocksky.Xrpc.App.Rocksky.Feed.GetFeed as GetFeed
import Rocksky.Xrpc.App.Rocksky.Feed.GetFeedGenerator as GetFeedGenerator
import Rocksky.Xrpc.App.Rocksky.Feed.GetFeedGenerators as GetFeedGenerators
import Rocksky.Xrpc.App.Rocksky.Feed.GetRecommendations as GetRecommendations
import Rocksky.Xrpc.App.Rocksky.Feed.GetStories as GetStories
import Rocksky.Xrpc.App.Rocksky.Feed.Search as Search

register :: Server -> Context -> Effect Unit
register server ctx = do
  GetAlbumRecommendations.register server ctx
  GetArtistRecommendations.register server ctx
  GetFeed.register server ctx
  GetFeedGenerator.register server ctx
  GetFeedGenerators.register server ctx
  GetRecommendations.register server ctx
  GetStories.register server ctx
  Search.register server ctx
