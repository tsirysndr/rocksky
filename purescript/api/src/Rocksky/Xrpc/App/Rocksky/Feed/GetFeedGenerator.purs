module Rocksky.Xrpc.App.Rocksky.Feed.GetFeedGenerator (register) where

import Prelude
import Atproto.XrpcServer as Xrpc
import Data.Array (head)
import Data.Maybe (Maybe(..), fromMaybe)
import Drizzle.Builder (leftJoin, run, selectFieldsFrom)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (tableSQL, toSQL)
import Effect (Effect)
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Lib.Foreign (undefined)
import Rocksky.Schema as T
import Rocksky.Schema.Feeds (SelectFeed)
import Rocksky.Schema.Users (SelectUser)
import Rocksky.Xrpc.App.Rocksky.Feed.GetFeedGenerators (presentation)
import Rocksky.Xrpc.Util as Util

register :: Server -> Context -> Effect Unit
register server ctx = Xrpc.method server "app.rocksky.feed.getFeedGenerator"
  { auth: Nothing
  , handler: \input -> do
      let params = Util.params input :: { feed :: String }
      rows :: Array { feeds :: SelectFeed, users :: SelectUser } <- run ctx.readDb
        (selectFieldsFrom { feeds: tableSQL T.feeds, users: tableSQL T.users } T.feeds
          # leftJoin T.users (SQL.eq (toSQL T.feedsC.userId) (toSQL T.usersC.id))
          # where_ (SQL.eq (toSQL T.feedsC.uri) (SQL.string params.feed)))
      pure (Util.json { view: fromMaybe undefined (presentation <$> head rows) }) }
