-- | Verifies a Bearer token against JWT_SECRET. Tokens carrying
-- | `type === "access_token"` must still have their `jti` in the
-- | access_tokens table; a deleted row means revoked.
module Rocksky.Lib.VerifyToken (VerifiedPayload, accessTokenType, verifyToken) where

import Prelude

import Data.Array (head)
import Data.Either (Either(..))
import Data.Maybe (Maybe(..))
import Data.Nullable (Nullable, toMaybe)
import Drizzle.Builder (selectFieldsFrom, limit, run)
import Drizzle.Database (Database)
import Drizzle.Dialect (Postgres)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (toSQL)
import Effect.Aff (Aff, error, throwError)
import Jsonwebtoken as Jwt
import Rocksky.Lib.Env (env)
import Rocksky.Lib.Foreign (unsafeFromForeign)
import Rocksky.Schema as T

type VerifiedPayload = { did :: Nullable String, jti :: Nullable String, type :: Nullable String }

accessTokenType :: String
accessTokenType = "access_token"

verifyToken :: Database Postgres -> String -> Aff VerifiedPayload
verifyToken db bearer = do
  payload <- case Jwt.verifyIgnoringExpiration bearer env."JWT_SECRET" of
    Left msg -> throwError (error msg)
    Right p -> pure (unsafeFromForeign p :: VerifiedPayload)
  case toMaybe payload.type, toMaybe payload.jti of
    Just t, Just jti | t == accessTokenType -> do
      rows :: Array { id :: String } <- run db
        ( selectFieldsFrom { id: toSQL T.accessTokensC.id } T.accessTokens
            # where_ (SQL.eq (toSQL T.accessTokensC.jti) (SQL.string jti))
            # limit 1
        )
      case head rows of
        Nothing -> throwError (error "Access token revoked")
        Just _ -> pure payload
    _, _ -> pure payload
