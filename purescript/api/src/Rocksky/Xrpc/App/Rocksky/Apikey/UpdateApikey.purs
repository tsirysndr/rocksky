module Rocksky.Xrpc.App.Rocksky.Apikey.UpdateApikey (register) where

import Prelude

import Atproto.XrpcServer as Xrpc
import Data.Array (head)
import Data.JSDate (now, toISOString)
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Nullable (toMaybe)
import Drizzle.Builder (runUpdateReturning, updateForeign)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (toSQL)
import Effect (Effect)
import Effect.Aff (throwError)
import Effect.Class (liftEffect)
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Lib.Foreign (mergeForeign, readStringAt, toForeign)
import Rocksky.Lib.JsonRecord (pick)
import Rocksky.Schema as T
import Rocksky.Schema.ApiKeys (SelectApiKey)
import Rocksky.Xrpc.App.Rocksky.Shout.Util (findUserByDid)
import Rocksky.Xrpc.Util (authDid, inputBody)

register :: Server -> Context -> Effect Unit
register server ctx = Xrpc.method server "app.rocksky.apikey.updateApikey"
  { auth: Just ctx.authVerifier
  , handler: \input -> do
      did <- case authDid input of
        Just value | value /= "" -> pure value
        _ -> throwError (Xrpc.authRequiredError "Sign in to update an API key.")

      body <- case inputBody input of
        Just value -> pure value
        Nothing -> Xrpc.throwInvalidRequest "Missing request body"

      id <- case readStringAt "id" body of
        Just value | value /= "" -> pure value
        _ -> Xrpc.throwInvalidRequest "Missing API key ID"

      name <- case readStringAt "name" body of
        Just value | value /= "" -> pure value
        _ -> Xrpc.throwInvalidRequest "API key name must not be empty"

      user <- findUserByDid ctx did
      timestamp <- liftEffect now

      let
        updates = mergeForeign
          (pick [ "description" ] body)
          (toForeign { name, updatedAt: timestamp })

      rows :: Array SelectApiKey <- runUpdateReturning ctx.db
        ( updateForeign T.apiKeys updates
            # where_
                ( SQL.and
                    (SQL.eq (toSQL T.apiKeysC.id) (SQL.string id))
                    (SQL.eq (toSQL T.apiKeysC.userId) (SQL.string user.id))
                )
        )

      row <- case head rows of
       Just value -> pure value
       Nothing ->
         throwError
           (Xrpc.invalidRequestNamedError "API key not found" "NotFound")

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
