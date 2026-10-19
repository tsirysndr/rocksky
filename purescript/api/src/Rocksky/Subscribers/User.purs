module Rocksky.Subscribers.User (onNewUser, handle) where

import Prelude
import Consola as Log
import Control.Alt ((<|>))
import Data.Array (head, nub)
import Data.Either (Either(..))
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Traversable (traverse)
import Drizzle.Builder (run, selectFrom)
import Drizzle.Query (where_)
import Drizzle.Schema (toSQL)
import Drizzle.SQL as SQL
import Effect (Effect)
import Effect.Aff (Aff, attempt, error, throwError)
import Effect.Class (liftEffect)
import Foreign (Foreign)
import Nats (Subscription)
import Rocksky.Context (Context)
import Rocksky.Lib.Foreign (asArray, readStringAt, toForeign)
import Rocksky.Schema as T
import Rocksky.Schema.Users (SelectUser)
import Rocksky.Subscribers.Consumer (start)
import Rocksky.Typesense.Search (indexUsers)

onNewUser :: Context -> Effect Subscription
onNewUser ctx = start ctx "rocksky.user" (handle ctx)

handle :: Context -> Foreign -> Aff Unit
handle ctx payload = do
  let records = fromMaybe [payload] (asArray payload)
      readId record = readStringAt "xata_id" record <|> readStringAt "id" record
  case nub <$> traverse readId records of
    Nothing -> throwError (error "rocksky.user: expected xata_id or id")
    Just [] -> pure unit
    Just ids -> do
      users :: Array SelectUser <- run ctx.db (selectFrom T.users # where_ (SQL.inArray (toSQL T.usersC.id) (map SQL.string ids)))
      liftEffect (Log.info ("New user: " <> fromMaybe "undefined" (_.handle <$> head users)))
      result <- attempt (indexUsers ctx users)
      case result of
        Left e -> liftEffect (Log.warnF "[typesense] index failed:" [toForeign e])
        Right _ -> pure unit
