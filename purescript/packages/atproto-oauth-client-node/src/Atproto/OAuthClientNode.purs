-- | Bindings for `@atproto/oauth-client-node`.
-- |
-- | The client is built with PureScript-implemented state and session stores
-- | (`StoreImpl`), an optional request lock and an optional custom `fetch`.
-- | Application-specific authorization is installed separately by Rocksky.Auth.OauthClient.
module Atproto.OAuthClientNode
  ( Client
  , ClientMetadata
  , ClientOptions
  , StoreImpl
  , RequestLock
  , Keyset
  , createClient
  , clientMetadata
  , jwks
  , restore
  , authorize
  , AuthorizeOptions
  , defaultAuthorizeOptions
  , callback
  , CallbackResult
  , sessionDid
  , isTokenRefreshError
  , isTokenRevokedError
  , isTokenInvalidError
  , errorName
  , keysetFromKeys
  , Key
  ) where

import Prelude

import Atproto.Api (OAuthSession)
import Control.Promise (Promise, fromAff, toAffE)
import Data.Maybe (Maybe(..))
import Data.Nullable (Nullable, toMaybe, toNullable)
import Effect (Effect)
import Effect.Aff (Aff)
import Effect.Exception (Error)
import Effect.Uncurried (EffectFn2, mkEffectFn2)
import Foreign (Foreign)

foreign import data Client :: Type
foreign import data Keyset :: Type
foreign import data Key :: Type

type ClientMetadata =
  { client_name :: String
  , client_id :: String
  , client_uri :: String
  , redirect_uris :: Array String
  , scope :: String
  , grant_types :: Array String
  , response_types :: Array String
  , application_type :: String
  , token_endpoint_auth_method :: String
  , token_endpoint_auth_signing_alg :: Nullable String
  , dpop_bound_access_tokens :: Boolean
  , jwks_uri :: Nullable String
  }

-- | A key/value store whose values are JSON strings (the SDK's state and
-- | session objects, serialised).
type StoreImpl =
  { get :: String -> Aff (Maybe String)
  , set :: String -> String -> Aff Unit
  , del :: String -> Aff Unit
  }

-- | `requestLock(key, fn)`: run `fn` while holding a distributed lock.
type RequestLock = String -> Aff Unit -> Aff Unit

type ClientOptions =
  { clientMetadata :: ClientMetadata
  , keyset :: Maybe Keyset
  , stateStore :: StoreImpl
  , sessionStore :: StoreImpl
  , requestLock :: Maybe RequestLock
  , fetch :: Maybe Foreign
  }

type RawStore =
  { get :: String -> Effect (Promise (Nullable String))
  , set :: EffectFn2 String String (Promise Unit)
  , del :: String -> Effect (Promise Unit)
  }

rawStore :: StoreImpl -> RawStore
rawStore s =
  { get: \k -> fromAff (toNullable <$> s.get k)
  , set: mkEffectFn2 \k v -> fromAff (s.set k v)
  , del: \k -> fromAff (s.del k)
  }

foreign import createClientImpl
  :: { clientMetadata :: ClientMetadata
     , keyset :: Nullable Keyset
     , stateStore :: RawStore
     , sessionStore :: RawStore
     , requestLock :: Nullable (EffectFn2 String (Effect (Promise Unit)) (Promise Unit))
     , fetch :: Nullable Foreign
     }
  -> Effect Client

createClient :: ClientOptions -> Effect Client
createClient o = createClientImpl
  { clientMetadata: o.clientMetadata
  , keyset: toNullable o.keyset
  , stateStore: rawStore o.stateStore
  , sessionStore: rawStore o.sessionStore
  , requestLock: toNullable (map (\l -> mkEffectFn2 \k fn -> fromAff (l k (toAffE fn))) o.requestLock)
  , fetch: toNullable o.fetch
  }

foreign import clientMetadata :: Client -> Foreign
foreign import jwks :: Client -> Foreign

foreign import restoreImpl :: Client -> String -> Effect (Promise (Nullable OAuthSession))

-- | `client.restore(did)`; `Nothing` when there is no stored session.
restore :: Client -> String -> Aff (Maybe OAuthSession)
restore c d = toMaybe <$> toAffE (restoreImpl c d)

type AuthorizeOptions = { scope :: Nullable String, state :: Nullable String, prompt :: Nullable String }

defaultAuthorizeOptions :: AuthorizeOptions
defaultAuthorizeOptions = { scope: toNullable Nothing, state: toNullable Nothing, prompt: toNullable Nothing }

foreign import authorizeImpl :: Client -> String -> AuthorizeOptions -> Effect (Promise String)

-- | `client.authorize(input, options)` → the authorization URL.
authorize :: Client -> String -> AuthorizeOptions -> Aff String
authorize c i o = toAffE (authorizeImpl c i o)

type CallbackResult = { session :: OAuthSession, state :: Nullable String }

foreign import callbackImpl :: Client -> String -> Effect (Promise CallbackResult)

-- | `client.callback(new URLSearchParams(query))`.
callback :: Client -> String -> Aff CallbackResult
callback c q = toAffE (callbackImpl c q)

foreign import sessionDid :: OAuthSession -> String

foreign import isTokenRefreshError :: Error -> Boolean
foreign import isTokenRevokedError :: Error -> Boolean
foreign import isTokenInvalidError :: Error -> Boolean

foreign import errorName :: Error -> String

foreign import keysetFromKeys :: Array Key -> Keyset
