module Rocksky.Lib.AuthVerifier (authVerifier, bearerFrom) where

import Prelude

import Atproto.XrpcServer (AuthOutput(..), AuthVerifier)
import Data.Array (index)
import Data.Maybe (Maybe(..))
import Data.String (Pattern(..), split, trim)
import Drizzle.Database (Database)
import Drizzle.Dialect (Postgres)
import Express as Express
import Rocksky.Lib.Foreign (toForeign)
import Rocksky.Lib.VerifyToken (verifyToken)

-- | The token in `Authorization: Bearer <token>`; `Nothing` for missing,
-- | empty or the literal "null" some clients send.
bearerFrom :: Maybe String -> Maybe String
bearerFrom header = do
  h <- header
  tok <- index (split (Pattern " ") h) 1
  let t = trim tok
  if t == "" || t == "null" then Nothing else Just t

authVerifier :: Database Postgres -> AuthVerifier
authVerifier db { req } = case bearerFrom (Express.reqHeader req "authorization") of
  Nothing -> pure Anonymous
  Just bearer -> Credentials <<< toForeign <$> verifyToken db bearer
