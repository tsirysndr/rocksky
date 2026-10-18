module Rocksky.Webscrobbler.App (app) where

import Prelude
import Data.Array (head)
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Nullable (toMaybe)
import Drizzle.Builder (insertForeign, leftJoin, limit, run, runInsertReturning, runUpdateReturning, selectFieldsFrom, selectFrom, update)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (tableSQL, toSQL)
import Effect (Effect)
import Effect.Aff (Aff)
import Effect.Class (liftEffect)
import Hono as Hono
import Node.Crypto (randomUUID)
import Rocksky.Context (Context)
import Rocksky.Lib.AuthVerifier (bearerFrom)
import Rocksky.Lib.Foreign (toForeign)
import Rocksky.Lib.Matching (matches)
import Rocksky.Lib.Rest as Rest
import Rocksky.Lib.VerifyToken (verifyToken)
import Rocksky.Schema as T
import Rocksky.Schema.Users (SelectUser)
import Rocksky.Schema.Webscrobblers (SelectWebscrobblers)

withUser :: Context -> Hono.Context -> (String -> SelectUser -> Aff Hono.Response) -> Aff Hono.Response
withUser ctx c action = case bearerFrom (Hono.reqHeader c "authorization") of
  Nothing -> Rest.text c 401 "Unauthorized"
  Just bearer -> do
    token <- verifyToken ctx.db bearer
    let did = fromMaybe "" (toMaybe token.did)
    rows :: Array SelectUser <- run ctx.db (selectFrom T.users # where_ (SQL.or (SQL.eq (toSQL T.usersC.did) (SQL.string did)) (SQL.eq (toSQL T.usersC.handle) (SQL.string did))) # limit 1)
    case head rows of
      Nothing -> Rest.text c 401 "Unauthorized"
      Just user -> action did user

app :: Context -> Effect Hono.App
app ctx = do
  a <- Hono.new
  Hono.get a "/" \c -> withUser ctx c \did user -> do
    rows :: Array { webscrobblers :: SelectWebscrobblers } <- run ctx.db
      (selectFieldsFrom { webscrobblers: tableSQL T.webscrobblers } T.webscrobblers
        # leftJoin T.users (SQL.eq (toSQL T.webscrobblersC.userId) (toSQL T.usersC.id))
        # where_ (SQL.eq (toSQL T.usersC.did) (SQL.string did)))
    case head rows of
      Just row -> Rest.json c 200 (toForeign row.webscrobblers)
      Nothing -> do
        uuid <- liftEffect randomUUID
        records :: Array SelectWebscrobblers <- runInsertReturning ctx.db (insertForeign T.webscrobblers [toForeign { uuid, userId: user.id, name: "webscrobbler" }])
        record <- Rest.firstRow records
        Rest.json c 200 (toForeign record)
  Hono.put a "/:id" \c -> withUser ctx c \_ user -> do
    let id = Hono.reqParam c "id"
    if not (matches "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$" id) then Rest.text c 400 "Invalid id"
    else do
      existing :: Array SelectWebscrobblers <- run ctx.db (selectFrom T.webscrobblers # where_ (SQL.eq (toSQL T.webscrobblersC.userId) (SQL.string user.id)) # limit 1)
      records :: Array SelectWebscrobblers <- case head existing of
        Just row -> runUpdateReturning ctx.db (update T.webscrobblers { uuid: id, userId: user.id, name: "webscrobbler" } # where_ (SQL.eq (toSQL T.webscrobblersC.id) (SQL.string row.id)))
        Nothing -> runInsertReturning ctx.db (insertForeign T.webscrobblers [toForeign { uuid: id, userId: user.id, name: "webscrobbler" }])
      record <- Rest.firstRow records
      Rest.json c 200 (toForeign record)
  pure a
