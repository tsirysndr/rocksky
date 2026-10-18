module Rocksky.Xrpc.App.Rocksky.Feed.GetFeedGenerators (register, presentation) where

import Prelude
import Atproto.XrpcServer as Xrpc
import Data.Maybe (Maybe(..))
import Drizzle.Builder (leftJoin, limit, run, selectFieldsFrom)
import Drizzle.SQL as SQL
import Drizzle.Schema (tableSQL, toSQL)
import Effect (Effect)
import Foreign (Foreign)
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Lib.Foreign (toForeign)
import Rocksky.Schema as T
import Rocksky.Schema.Feeds (SelectFeed)
import Rocksky.Schema.Users (SelectUser)
import Rocksky.Xrpc.Util as Util

type FeedRow = { feeds :: SelectFeed, users :: SelectUser }

presentation :: FeedRow -> Foreign
presentation { feeds, users } = toForeign
  { id: feeds.id, name: feeds.displayName, description: feeds.description, avatar: feeds.avatar, did: feeds.did, uri: feeds.uri
  , creator: { id: users.id, did: users.did, handle: users.handle, displayName: users.displayName, avatar: users.avatar } }

register :: Server -> Context -> Effect Unit
register server ctx = Xrpc.method server "app.rocksky.feed.getFeedGenerators"
  { auth: Nothing
  , handler: \input -> do
      let size = case Util.paramInt input "size" of
            Just n | n /= 0 -> n
            _ -> 100
      rows :: Array FeedRow <- run ctx.readDb
        (selectFieldsFrom { feeds: tableSQL T.feeds, users: tableSQL T.users } T.feeds
          # leftJoin T.users (SQL.eq (toSQL T.feedsC.userId) (toSQL T.usersC.id)) # limit size)
      pure (Util.json { feeds: map presentation rows }) }
