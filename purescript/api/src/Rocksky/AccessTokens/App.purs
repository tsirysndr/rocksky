module Rocksky.AccessTokens.App (app) where

import Prelude
import Data.Array (null)
import Data.Either (Either(..), either)
import Data.JSDate (JSDate, getTime, now)
import Data.Nullable (Nullable)
import Data.Int (floor)
import Data.Maybe (Maybe(..))
import Data.String.CodeUnits as String
import Drizzle.Builder (deleteFrom, insertForeign, limit, offset, orderBy, run, runDeleteReturning, runInsertReturning, selectFieldsFrom)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (toSQL)
import Effect (Effect)
import Effect.Aff (attempt)
import Effect.Class (liftEffect)
import Hono as Hono
import Jsonwebtoken as Jwt
import Node.Crypto (randomUUID)
import Rocksky.Context (Context)
import Rocksky.Lib.Env (env)
import Rocksky.Lib.Foreign (deleteKeys, mergeForeign, toForeign)
import Rocksky.Lib.Rest as Rest
import Rocksky.Lib.StorageCrypto (encryptCredential)
import Rocksky.Lib.Validate (formatZodLike)
import Rocksky.Lib.VerifyToken (accessTokenType)
import Rocksky.Schema as T
import Rocksky.Schema.AccessTokens (SelectAccessToken)
import Rocksky.Types.AccessToken (parseCreateAccessToken)

app :: Context -> Effect Hono.App
app ctx = do
  a <- Hono.new
  Hono.get a "/" \c -> withUser c \user -> do
    rows :: Array { id :: String, name :: String, lastFour :: String, lastUsedAt :: Nullable JSDate, createdAt :: JSDate, updatedAt :: JSDate } <- run ctx.db
      ( selectFieldsFrom { id: toSQL T.accessTokensC.id, name: toSQL T.accessTokensC.name, lastFour: toSQL T.accessTokensC.lastFour, lastUsedAt: toSQL T.accessTokensC.lastUsedAt, createdAt: toSQL T.accessTokensC.createdAt, updatedAt: toSQL T.accessTokensC.updatedAt } T.accessTokens
          # where_ (SQL.eq (toSQL T.accessTokensC.userId) (SQL.string user.id))
          # orderBy [ SQL.desc (toSQL T.accessTokensC.createdAt) ]
          # limit (min 200 (Rest.queryInt c "size" 50))
          # offset (max 0 (Rest.queryInt c "offset" 0))
      )
    Rest.json c 200 (toForeign rows)
  Hono.post a "/" \c -> withUser c \user -> do
    body <- either (const (toForeign {})) identity <$> attempt (Hono.reqJson c)
    case parseCreateAccessToken body of
      Left errors -> Rest.text c 400 ("Invalid input: " <> formatZodLike errors)
      Right input -> do
        jti <- liftEffect randomUUID
        iat <- liftEffect (floor <<< (_ / 1000.0) <<< getTime <$> now)
        let token = Jwt.sign (toForeign { did: user.did, jti, type: accessTokenType, iat }) env."JWT_SECRET"
        tokenEncrypted <- encryptCredential token
        let lastFour = String.drop (String.length token - 4) token
        rows :: Array SelectAccessToken <- runInsertReturning ctx.db (insertForeign T.accessTokens [ toForeign { userId: user.id, name: input.name, jti, tokenEncrypted, lastFour } ])
        record <- Rest.firstRow rows
        Rest.json c 200 (mergeForeign (deleteKeys [ "userId", "jti", "tokenEncrypted" ] (toForeign record)) (toForeign { token }))
  Hono.delete a "/:id" \c -> withUser c \user -> do
    rows :: Array SelectAccessToken <- runDeleteReturning ctx.db
      (deleteFrom T.accessTokens # where_ (SQL.and (SQL.eq (toSQL T.accessTokensC.id) (SQL.string (Hono.reqParam c "id"))) (SQL.eq (toSQL T.accessTokensC.userId) (SQL.string user.id))))
    if null rows then Rest.text c 404 "Not found" else Rest.json c 200 (toForeign { success: true })
  pure a
  where
  withUser c action = do
    user <- either (const Nothing) identity <$> attempt (Rest.resolveUser ctx c)
    case user of
      Nothing -> Rest.text c 401 "Unauthorized"
      Just u -> action u
