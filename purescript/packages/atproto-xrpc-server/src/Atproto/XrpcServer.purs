-- | Bindings for `@atproto/xrpc-server`. Lexicon documents are plain JSON
-- | (`Foreign`), handlers are `HandlerInput -> Aff HandlerOutput`.
module Atproto.XrpcServer
  ( Server
  , Options
  , defaultOptions
  , createServer
  , router
  , method
  , MethodConfig
  , HandlerInput
  , Params
  , Input
  , Auth
  , HandlerOutput(..)
  , AuthVerifier
  , AuthOutput(..)
  , credentialsDid
  , invalidRequestError
  , isInvalidRequestError
  , invalidRequestNamedError
  , authRequiredError
  , throwInvalidRequest
  ) where

import Prelude

import Control.Promise (Promise, fromAff)
import Data.Maybe (Maybe(..))
import Data.Nullable (Nullable, toMaybe, toNullable)
import Effect (Effect)
import Effect.Aff (Aff, throwError)
import Effect.Exception (Error)
import Effect.Uncurried (EffectFn1, EffectFn3, mkEffectFn1, runEffectFn3)
import Express (Request, Response, Router)
import Foreign (Foreign)
import Foreign.Object (Object)
import Foreign.Object as Object
import Node.Buffer (Buffer)

foreign import data Server :: Type

type Options =
  { validateResponse :: Boolean
  , payload :: { jsonLimit :: Int, textLimit :: Int, blobLimit :: Int }
  }

defaultOptions :: Options
defaultOptions =
  { validateResponse: false
  , payload: { jsonLimit: 100 * 1024, textLimit: 100 * 1024, blobLimit: 5 * 1024 * 1024 }
  }

-- | `createServer(lexicons, options)`.
foreign import createServer :: Array Foreign -> Options -> Effect Server

-- | `server.router`: the express app serving `/xrpc/*`.
foreign import router :: Server -> Router

-- | Query/procedure params, already validated against the lexicon.
type Params = Foreign

type Input = { encoding :: String, body :: Foreign }

type Auth = { credentials :: Nullable Foreign }

type HandlerInput =
  { params :: Params
  , input :: Nullable Input
  , auth :: Nullable Auth
  , req :: Request
  , res :: Response
  }

data HandlerOutput
  = NoContent
  | Json Foreign
  | JsonWithHeaders Foreign (Object String)
  | Encoded String Buffer
  | Failure Int String
  | FailureNamed Int String String

data AuthOutput
  = Anonymous
  | Credentials Foreign
  | AuthFailure Int String

type AuthVerifier = { req :: Request, res :: Response } -> Aff AuthOutput

type MethodConfig =
  { auth :: Maybe AuthVerifier
  , handler :: HandlerInput -> Aff HandlerOutput
  }

type RawOutput = { kind :: String, encoding :: String, body :: Foreign, headers :: Object String, status :: Int, message :: String, error :: Nullable String }

encodeOutput :: HandlerOutput -> RawOutput
encodeOutput = case _ of
  NoContent -> base { kind = "empty" }
  Json b -> base { kind = "success", encoding = "application/json", body = b }
  JsonWithHeaders b h -> base { kind = "success", encoding = "application/json", body = b, headers = h }
  Encoded enc buf -> base { kind = "buffer", encoding = enc, body = toForeign buf }
  Failure s m -> base { kind = "error", status = s, message = m }
  FailureNamed s e m -> base { kind = "error", status = s, message = m, error = toNullable (Just e) }
  where
  base = { kind: "", encoding: "", body: toForeign unit, headers: Object.empty, status: 200, message: "", error: toNullable Nothing }

type RawAuth = { kind :: String, credentials :: Foreign, status :: Int, message :: String }

encodeAuth :: AuthOutput -> RawAuth
encodeAuth = case _ of
  Anonymous -> { kind: "anonymous", credentials: toForeign unit, status: 0, message: "" }
  Credentials c -> { kind: "credentials", credentials: c, status: 0, message: "" }
  AuthFailure s m -> { kind: "error", credentials: toForeign unit, status: s, message: m }

foreign import toForeign :: forall a. a -> Foreign

foreign import methodImpl
  :: EffectFn3 Server String
       { auth :: Nullable (EffectFn1 { req :: Request, res :: Response } (Promise RawAuth))
       , handler :: EffectFn1 HandlerInput (Promise RawOutput)
       }
       Unit

-- | `server.method(nsid, { auth, handler })`.
method :: Server -> String -> MethodConfig -> Effect Unit
method s nsid cfg = runEffectFn3 methodImpl s nsid
  { auth: toNullable (map (\v -> mkEffectFn1 \c -> fromAff (encodeAuth <$> v c)) cfg.auth)
  , handler: mkEffectFn1 \i -> fromAff (encodeOutput <$> cfg.handler i)
  }

foreign import credentialsDidImpl :: Nullable Auth -> Nullable String

-- | `auth.credentials?.did`.
credentialsDid :: Nullable Auth -> Maybe String
credentialsDid = toMaybe <<< credentialsDidImpl

-- | `new InvalidRequestError(message)` / `new AuthRequiredError(message)`,
-- | for handlers that throw instead of returning `Failure`.
foreign import invalidRequestError :: String -> Error
foreign import invalidRequestNamedError :: String -> String -> Error
foreign import authRequiredError :: String -> Error

throwInvalidRequest :: forall a. String -> Aff a
throwInvalidRequest = throwError <<< invalidRequestError

foreign import isInvalidRequestError :: Error -> Boolean
