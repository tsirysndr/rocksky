module Rocksky.Apikeys.App (app) where

import Prelude
import Data.Either (Either(..))
import Data.Maybe (fromMaybe)
import Data.Nullable (toMaybe)
import Drizzle.Builder (deleteFrom, insertForeign, limit, offset, run, runDelete, runInsertReturning, runUpdateReturning, selectFrom, updateForeign)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (toSQL)
import Effect (Effect)
import Effect.Class (liftEffect)
import Hono as Hono
import Node.Crypto (randomBytesHex)
import Rocksky.Context (Context)
import Rocksky.Lib.Foreign (deleteKeys, toForeign)
import Rocksky.Lib.Rest as Rest
import Rocksky.Lib.Validate (formatZodLike)
import Rocksky.Schema as T
import Rocksky.Schema.ApiKeys (SelectApiKey)
import Rocksky.Types.ApiKey (parseApiKey)

app :: Context -> Effect Hono.App
app ctx = do
  a <- Hono.new
  Hono.get a "/" \c -> Rest.withUser ctx c \user -> do
    rows :: Array SelectApiKey <- run ctx.db
      ( selectFrom T.apiKeys # where_ (SQL.eq (toSQL T.apiKeysC.userId) (SQL.string user.id))
          # limit (Rest.queryInt c "size" 20)
          # offset (Rest.queryInt c "offset" 0)
      )
    Rest.json c 200 (toForeign (map (deleteKeys [ "userId" ] <<< toForeign) rows))
  Hono.post a "/" \c -> Rest.withUser ctx c \user -> do
    body <- Hono.reqJson c
    case parseApiKey body of
      Left errors -> Rest.text c 400 ("Invalid api key data: " <> formatZodLike errors)
      Right input -> do
        apiKey <- liftEffect (randomBytesHex 16)
        sharedSecret <- liftEffect (randomBytesHex 16)
        rows :: Array SelectApiKey <- runInsertReturning ctx.db
          (insertForeign T.apiKeys [ toForeign { name: input.name, description: fromMaybe "" (toMaybe input.description), enabled: fromMaybe true input.enabled, apiKey, sharedSecret, userId: user.id } ])
        record <- Rest.firstRow rows
        Rest.json c 200 (present record)
  Hono.put a "/:id" \c -> Rest.withUser ctx c \user -> do
    body <- Hono.reqJson c
    rows :: Array SelectApiKey <- runUpdateReturning ctx.db
      (updateForeign T.apiKeys body # where_ (owned user.id (Hono.reqParam c "id")))
    record <- Rest.firstRow rows
    Rest.json c 200 (present record)
  Hono.delete a "/:id" \c -> Rest.withUser ctx c \user -> do
    runDelete ctx.db (deleteFrom T.apiKeys # where_ (owned user.id (Hono.reqParam c "id")))
    Rest.json c 200 (toForeign { success: true })
  pure a
  where
  owned userId id = SQL.and (SQL.eq (toSQL T.apiKeysC.id) (SQL.string id)) (SQL.eq (toSQL T.apiKeysC.userId) (SQL.string userId))
  present record = toForeign { id: record.id, name: record.name, description: record.description, api_key: record.apiKey, shared_secret: record.sharedSecret }
