module Rocksky.Xrpc.App.Rocksky.Apikey.GetApikeys (register) where

import Prelude

import Atproto.XrpcServer as Xrpc
import Data.JSDate (toISOString)
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Nullable (toMaybe)
import Data.Traversable (traverse)
import Drizzle.Builder (run,limit, offset, orderBy, selectFrom)
import Drizzle.Query ( where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (toSQL)
import Effect (Effect)
import Effect.Aff (Aff, throwError)
import Effect.Class (liftEffect)
import Foreign (Foreign)
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Lib.Foreign (toForeign)
import Rocksky.Schema as T
import Rocksky.Schema.ApiKeys (SelectApiKey)
import Rocksky.Xrpc.App.Rocksky.Shout.Util (findUserByDid)
import Rocksky.Xrpc.Util (authDid, paramInt)

register :: Server -> Context -> Effect Unit
register server ctx = Xrpc.method server "app.rocksky.apikey.getApikeys"
  { auth: Just ctx.authVerifier, handler: \input -> do
      did <- case authDid input of
        Just value | value /= "" -> pure value
        _ -> throwError (Xrpc.authRequiredError "Sign in to retrieve API keys.")

      let
        pageLimit = fromMaybe 20 (paramInt input "limit")
        pageOffset = fromMaybe  0 (paramInt input "offset")

      when (pageLimit < 1 || pageLimit > 100) $
        Xrpc.throwInvalidRequest "limit must be between 1 and 100"

      when (pageOffset < 0) $
        Xrpc.throwInvalidRequest "offset must be non-negative"

      user <- findUserByDid ctx did

      rows :: Array SelectApiKey <- run ctx.db
        ( selectFrom T.apiKeys
            # where_ (SQL.eq (toSQL T.apiKeysC.userId) (SQL.string user.id))
            # orderBy
                [ SQL.desc (toSQL T.apiKeysC.createdAt)
                , SQL.asc (toSQL T.apiKeysC.id)
                ]
            # limit pageLimit
            # offset pageOffset
        )

      apikeys <- traverse present rows
      pure $ Xrpc.Json $ toForeign { apikeys }
  }

present :: SelectApiKey -> Aff Foreign
present row = do
  createdAt <- liftEffect (toISOString row.createdAt)
  updatedAt <- liftEffect (toISOString row.updatedAt)

  pure $ toForeign
    { id: row.id
    , name: row.name
    , description: fromMaybe "" (toMaybe row.description)
    , enabled: row.enabled
    , apiKey: row.apiKey
    , sharedSecret: row.sharedSecret
    , createdAt
    , updatedAt
    }
