module Rocksky.Lib.Rest where

import Prelude
import Data.Array (head)
import Data.Int (fromString)
import Data.Maybe (Maybe(..))
import Data.Nullable (toMaybe)
import Drizzle.Builder (limit, run, selectFrom)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (toSQL)
import Effect.Aff (Aff, error, throwError)
import Effect.Class (liftEffect)
import Foreign (Foreign)
import Hono as Hono
import Rocksky.Context (Context)
import Rocksky.Lib.AuthVerifier (bearerFrom)
import Rocksky.Lib.VerifyToken (verifyToken)
import Rocksky.Schema as T
import Rocksky.Schema.Users (SelectUser)

resolveUser :: Context -> Hono.Context -> Aff (Maybe SelectUser)
resolveUser ctx c = case bearerFrom (Hono.reqHeader c "authorization") of
  Nothing -> pure Nothing
  Just bearer -> do
    payload <- verifyToken ctx.db bearer
    case toMaybe payload.did of
      Nothing -> pure Nothing
      Just did -> head <$> run ctx.db (selectFrom T.users # where_ (SQL.eq (toSQL T.usersC.did) (SQL.string did)) # limit 1)

withUser :: Context -> Hono.Context -> (SelectUser -> Aff Hono.Response) -> Aff Hono.Response
withUser ctx c action = resolveUser ctx c >>= case _ of
  Nothing -> text c 401 "Unauthorized"
  Just user -> action user

queryInt :: Hono.Context -> String -> Int -> Int
queryInt c key fallback = case Hono.reqQuery c key >>= fromString of
  Just value | value /= 0 -> value
  _ -> fallback

text :: Hono.Context -> Int -> String -> Aff Hono.Response
text c status body = liftEffect (Hono.status c status *> Hono.text c body)

json :: Hono.Context -> Int -> Foreign -> Aff Hono.Response
json c status body = liftEffect (Hono.status c status *> Hono.json c body)

firstRow :: forall a. Array a -> Aff a
firstRow rows = case head rows of
  Just row -> pure row
  Nothing -> throwError (error "Database mutation returned no row")
