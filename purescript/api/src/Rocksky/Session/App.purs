module Rocksky.Session.App (app) where

import Prelude

import Data.Either (Either(..))
import Data.Maybe (Maybe(..), isJust)
import Data.Nullable (toMaybe)
import Effect (Effect)
import Effect.Aff (attempt)
import Effect.Class (liftEffect)
import Effect.Exception (message)
import Hono as Hono
import Jsonwebtoken as Jwt
import Rocksky.Context (Context)
import Rocksky.Session.Status (check)
import Rocksky.Db as Db
import Rocksky.Lib.Agent (createAgent, pdsSessionExpired)
import Rocksky.Lib.AuthVerifier (bearerFrom)
import Rocksky.Lib.Env (env)
import Rocksky.Lib.Foreign (toForeign)
import Rocksky.Lib.Rest as Rest
import Rocksky.Lib.VerifyToken (verifyToken)

app :: Context -> Effect Hono.App
app ctx = do
  a <- Hono.new
  Hono.get a "/status" \c -> do
    liftEffect $ Hono.setHeader c "Cache-Control" "no-store"
    let unauthorized = Rest.json c 401 (toForeign { error: "Unauthorized" })
    let unavailable = Rest.json c 503 (toForeign { error: "session_unavailable" })
    case bearerFrom (Hono.reqHeader c "authorization") of
      Nothing -> unauthorized
      Just token -> case Jwt.verifyIgnoringExpiration token env."JWT_SECRET" of
        Left _ -> unauthorized
        Right _ -> do
          verified <- attempt (verifyToken ctx.db token)
          case verified of
            Left e | message e == "Access token revoked" -> unauthorized
            Left _ -> unavailable
            Right payload -> case toMaybe payload.did of
              Nothing -> unauthorized
              Just did -> do
                result <- attempt $ check (hasSession did) (isJust <$> createAgent ctx did)
                case result of
                  Left _ -> unavailable
                  Right 200 -> Rest.json c 200 (toForeign { active: true })
                  Right 401 -> Rest.json c 401 (toForeign pdsSessionExpired)
                  Right _ -> unavailable
  pure a
  where
  hasSession did = do
    oauth <- Db.getAuthSession ctx.sqliteDb did
    case oauth of
      Just _ -> pure true
      Nothing -> isJust <$> Db.getAuthSession ctx.sqliteDb ("atp:" <> did)
