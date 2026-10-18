-- | Bindings for `express` (v5): just enough to mount routers and
-- | middleware and to read requests inside XRPC handlers.
module Express
  ( App
  , Router
  , Request
  , Response
  , Middleware
  , new
  , useMiddleware
  , useRouter
  , usePathRouter
  , listen
  , reqHeader
  , reqHeaders
  , reqPath
  , reqMethod
  , reqQuery
  , resStatusCode
  , onFinish
  , sendJson
  , setHeader
  , toRouter
  ) where

import Prelude

import Data.Maybe (Maybe)
import Data.Nullable (Nullable, toMaybe)
import Effect (Effect)
import Effect.Uncurried (EffectFn2, EffectFn3, mkEffectFn3, runEffectFn2)
import Foreign (Foreign)
import Foreign.Object (Object)

foreign import data App :: Type
foreign import data Router :: Type
foreign import data Request :: Type
foreign import data Response :: Type

-- | `(req, res, next) => ...`. Call `next` to continue.
type Middleware = Request -> Response -> Effect Unit -> Effect Unit

foreign import newApp :: Effect App

new :: Effect App
new = newApp

foreign import useMiddlewareImpl :: EffectFn2 App (EffectFn3 Request Response (Effect Unit) Unit) Unit

useMiddleware :: App -> Middleware -> Effect Unit
useMiddleware app mw = runEffectFn2 useMiddlewareImpl app (mkEffectFn3 mw)

-- | `app.use(router)`; a router is any express-compatible handler.
foreign import useRouter :: App -> Router -> Effect Unit

foreign import usePathRouter :: App -> String -> Router -> Effect Unit

-- | `app.listen(port, cb)`.
foreign import listen :: App -> Int -> Effect Unit -> Effect Unit

foreign import reqHeaderImpl :: Request -> String -> Nullable String

reqHeader :: Request -> String -> Maybe String
reqHeader r k = toMaybe (reqHeaderImpl r k)

foreign import reqHeaders :: Request -> Object Foreign
foreign import reqPath :: Request -> String
foreign import reqMethod :: Request -> String
foreign import reqQuery :: Request -> Foreign
foreign import resStatusCode :: Response -> Effect Int

foreign import onFinish :: Response -> Effect Unit -> Effect Unit

-- | Treat any foreign express handler/router as a `Router`.
foreign import toRouter :: Foreign -> Router

foreign import sendJson :: Response -> Foreign -> Effect Unit
foreign import setHeader :: Response -> String -> String -> Effect Unit
