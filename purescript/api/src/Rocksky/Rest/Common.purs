module Rocksky.Rest.Common where

import Prelude
import Data.Array as A
import Data.Maybe (Maybe(..))
import Drizzle.Builder (limit, run, selectFrom)
import Drizzle.Query (where_)
import Drizzle.Schema (toSQL)
import Drizzle.SQL as SQL
import Effect (Effect)
import Effect.Aff (Aff)
import Effect.Class (liftEffect)
import Hono as Hono
import Rocksky.Context (Context)
import Rocksky.Lib.AuthVerifier (bearerFrom)
import Rocksky.Lib.Foreign as F
import Rocksky.Lib.Rest as Rest
import Rocksky.Lib.VerifyToken (verifyToken)
import Rocksky.Metrics as Metrics
import Rocksky.Schema as T
import Rocksky.Schema.Users (SelectUser)

route :: Context -> Hono.App -> String -> String -> Hono.Handler -> Effect Unit
route ctx app method path handler = (case method of
  "POST" -> Hono.post
  "DELETE" -> Hono.delete
  _ -> Hono.get) app path \c -> do
    liftEffect (Metrics.count ctx.metrics method path)
    handler c

withDid :: Context -> Hono.Context -> (String -> Aff Hono.Response) -> Aff Hono.Response
withDid ctx c action = case bearerFrom (Hono.reqHeader c "authorization") of
  Nothing -> Rest.text c 401 "Unauthorized"
  Just token -> do
    payload <- verifyToken ctx.db token
    action (F.unsafeFromForeign (F.toForeign payload.did))

withUser :: Context -> Hono.Context -> String -> (SelectUser -> Aff Hono.Response) -> Aff Hono.Response
withUser ctx c did action = do
  users <- run ctx.db (selectFrom T.users # where_ (SQL.eq (toSQL T.usersC.did) (SQL.string did)) # limit 1) :: Aff (Array SelectUser)
  case A.head users of
    Nothing -> Rest.text c 401 "Unauthorized"
    Just user -> action user
