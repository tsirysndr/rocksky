module Rocksky.Xrpc.App.Rocksky.Apikey.RemoveApikey (register) where

import Prelude

import Atproto.XrpcServer as Xrpc
import Data.JSDate (toISOString)
import Data.Array (head)
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Nullable (toMaybe)
import Drizzle.Builder (deleteFrom, runDeleteReturning)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (toSQL)
import Effect (Effect)
import Effect.Aff (throwError)
import Effect.Class (liftEffect)
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Lib.Foreign (toForeign)
import Rocksky.Schema as T
import Rocksky.Schema.ApiKeys (SelectApiKey)
import Rocksky.Xrpc.App.Rocksky.Shout.Util (findUserByDid)
import Rocksky.Xrpc.Util (authDid, paramString)

register :: Server -> Context -> Effect Unit
register server ctx = Xrpc.method server "app.rocksky.apikey.removeApikey"
  { auth: Just ctx.authVerifier
  , handler: \input -> do
    did <- case authDid input of
      Just value | value /= "" -> pure value
      _ -> throwError (Xrpc.authRequiredError "Sign in to remove an API key.")

    id <- case paramString input "id" of
      Just value | value /= "" -> pure value
      _ -> Xrpc.throwInvalidRequest "Missing API key ID"

    user <- findUserByDid ctx did

    rows :: Array SelectApiKey <- runDeleteReturning ctx.db
      ( deleteFrom T.apiKeys
          # where_
              ( SQL.and
                  (SQL.eq (toSQL T.apiKeysC.id) (SQL.string id))
                  (SQL.eq (toSQL T.apiKeysC.userId) (SQL.string user.id))
              )
      )

    row <- case head rows of
      Just value -> pure value
      Nothing ->
        throwError (Xrpc.invalidRequestNamedError "API key not found" "NotFound")

    createdAt <- liftEffect (toISOString row.createdAt)
    updatedAt <- liftEffect (toISOString row.updatedAt)

    pure $ Xrpc.Json $ toForeign
      { id: row.id
      , name: row.name
      , description: fromMaybe "" (toMaybe row.description)
      , enabled: row.enabled
      , createdAt
      , updatedAt
      }
  }
