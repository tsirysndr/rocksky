module Rocksky.Xrpc.App.Rocksky.Feed.Skeleton (fetch, baseUrl) where

import Prelude
import Axios as Axios
import Data.Array (head, index)
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Nullable (notNull)
import Data.String (Pattern(..), contains, split)
import Drizzle.Builder (run, selectFrom)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (toSQL)
import Effect.Aff (Aff, error, throwError)
import Effect.Class (liftEffect)
import Foreign (Foreign)
import Rocksky.Context (Context)
import Rocksky.Lib.Env (env)
import Rocksky.Lib.Foreign (mergeForeign, toForeign)
import Rocksky.Schema as T
import Rocksky.Schema.Feeds (SelectFeed)

baseUrl :: Boolean -> String -> String
baseUrl _ did =
  if contains (Pattern "localhost") env."PUBLIC_URL" || did == env."ROCKSKY_FEEDGEN_DID" then "http://localhost:" <> show env."ROCKSKY_FEEDGEN_PORT"
  else "https://" <> fromMaybe "undefined" (index (split (Pattern "did:web:") did) 1)

fetch :: Context -> Boolean -> String -> Foreign -> Aff Foreign
fetch ctx stories uri params = do
  rows :: Array SelectFeed <- run ctx.db (selectFrom T.feeds # where_ (SQL.eq (toSQL T.feedsC.uri) (SQL.string uri)))
  feed <- case head rows of
    Nothing -> throwError (error "Feed not found")
    Just value -> pure value
  client <- liftEffect (Axios.create (Axios.defaultConfig ""))
  Axios.data_ <$> Axios.getWith client (baseUrl stories feed.did <> "/xrpc/app.rocksky.feed.getFeedSkeleton")
    Axios.defaultRequestOptions { params = notNull (mergeForeign params (toForeign { feed: feed.uri })) }
