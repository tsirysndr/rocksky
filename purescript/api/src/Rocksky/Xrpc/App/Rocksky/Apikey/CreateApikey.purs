module Rocksky.Xrpc.App.Rocksky.Apikey.CreateApikey (register) where

import Prelude

import Atproto.XrpcServer as Xrpc
import Data.Array (head)
import Data.Either (Either(..))
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Nullable (toMaybe)
import Data.JSDate (toISOString)
import Drizzle.Builder (insertForeign, runInsertReturning)
import Effect (Effect)
import Effect.Aff (error, throwError)
import Effect.Class (liftEffect)
import Node.Crypto (randomBytesHex)
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Lib.Foreign (toForeign)
import Rocksky.Lib.Validate (formatZodLike)
import Rocksky.Schema as T
import Rocksky.Schema.ApiKeys (SelectApiKey)
import Rocksky.Types.ApiKey (parseApiKey)
import Rocksky.Xrpc.App.Rocksky.Shout.Util (findUserByDid)
import Rocksky.Xrpc.Util (authDid, inputBody)

register :: Server -> Context -> Effect Unit
register server ctx = Xrpc.method server "app.rocksky.apikey.createApikey"
  { auth: Just ctx.authVerifier, handler: \input -> do
      did <- case authDid input of
          Just value | value /= "" -> pure value
          _ -> throwError (Xrpc.authRequiredError "Sign in to create an API key.")

      body <- case inputBody input of
          Just value -> pure value
          Nothing -> Xrpc.throwInvalidRequest "Missing request body"

      params <- case parseApiKey body of
        Left errors ->
            Xrpc.throwInvalidRequest
              ("Invalid API key data: " <> formatZodLike errors)
        Right value -> pure value

      user <- findUserByDid ctx did
      apiKey <- liftEffect (randomBytesHex 16)
      sharedSecret <- liftEffect (randomBytesHex 16)

      rows :: Array SelectApiKey <- runInsertReturning ctx.db
        ( insertForeign T.apiKeys
            [ toForeign
                { name: params.name
                , description: fromMaybe "" (toMaybe params.description)
                , enabled: true
                , apiKey
                , sharedSecret
                , userId: user.id
                }
            ]
        )

      row <- case head rows of
         Just value -> pure value
         Nothing -> throwError (error "Failed to create API key")

      createdAt <- liftEffect (toISOString row.createdAt)
      updatedAt <- liftEffect (toISOString row.updatedAt)

      pure $ Xrpc.Json $ toForeign
        { id: row.id
        , name: row.name
        , description: fromMaybe "" (toMaybe row.description)
        , apiKey: row.apiKey
        , sharedSecret: row.sharedSecret
        , enabled: row.enabled
        , createdAt
        , updatedAt
        }
  }
