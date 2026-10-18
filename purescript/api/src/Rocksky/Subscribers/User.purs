module Rocksky.Subscribers.User (onNewUser, handle) where

import Prelude
import Consola as Log
import Data.Array (head)
import Data.Either (Either(..))
import Data.Maybe (fromMaybe)
import Drizzle.Builder (run, selectFrom)
import Drizzle.Query (where_)
import Drizzle.Schema (toSQL)
import Drizzle.SQL as SQL
import Effect (Effect)
import Effect.Aff (Aff, attempt)
import Effect.Class (liftEffect)
import Foreign (Foreign)
import Nats (Subscription)
import Rocksky.Context (Context)
import Rocksky.Lib.Foreign (path, toForeign, undefined)
import Rocksky.Schema as T
import Rocksky.Schema.Users (SelectUser)
import Rocksky.Subscribers.Consumer (start)
import Rocksky.Typesense.Search (indexUsers)

onNewUser :: Context -> Effect Subscription
onNewUser ctx = start ctx "rocksky.user" (handle ctx)

handle :: Context -> Foreign -> Aff Unit
handle ctx payload = do
  users :: Array SelectUser <- run ctx.db (selectFrom T.users # where_ (SQL.eq (toSQL T.usersC.id) (SQL.param (fromMaybe undefined (path "xata_id" payload)))))
  liftEffect (Log.info ("New user: " <> fromMaybe "undefined" (_.handle <$> head users)))
  result <- attempt (indexUsers ctx users)
  case result of
    Left e -> liftEffect (Log.warnF "[typesense] index failed:" [toForeign e])
    Right _ -> pure unit
