-- | Bindings for `hono`: apps, routes, middleware and the request context.
-- | Handlers are `Context -> Aff Response`; build responses with `json`,
-- | `text`, `redirect`, `body` or `rawResponse`.
module Hono
  ( App
  , Context
  , Response
  , Handler
  , Middleware
  , Next
  , new
  , get
  , post
  , put
  , patch
  , options
  , delete
  , all
  , route
  , use
  , usePath
  , fetchHandler
  , onError
  , notFound
  -- request
  , reqHeader
  , reqParam
  , reqQuery
  , reqQueries
  , reqJson
  , reqText
  , reqFormData
  , reqArrayBuffer
  , reqMethod
  , reqPath
  , reqUrl
  , reqRawHeader
  -- response
  , status
  , setHeader
  , json
  , jsonWith
  , text
  , textWith
  , html
  , redirect
  , body
  , bodyBuffer
  , rawResponse
  , notFoundResponse
  , setVar
  , getVar
  , FormData
  , formGet
  , formGetFile
  , FormFile
  , fileName
  , fileType
  , fileSize
  , fileBuffer
  , formValue
  , fileText
  ) where

import Prelude

import Control.Promise (Promise, fromAff, toAffE)
import Data.Maybe (Maybe)
import Data.Nullable (Nullable, toMaybe)
import Effect (Effect)
import Effect.Aff (Aff)
import Effect.Uncurried (EffectFn1, EffectFn2, EffectFn3, mkEffectFn1, mkEffectFn2, runEffectFn2, runEffectFn3)
import Fetch as Fetch
import Foreign (Foreign)
import Foreign.Object (Object)
import Node.Buffer (Buffer)

foreign import data App :: Type
foreign import data Context :: Type
foreign import data Response :: Type
foreign import data FormData :: Type
foreign import data FormFile :: Type

type Handler = Context -> Aff Response

-- | `next()` as an `Aff`.
type Next = Aff Unit

-- | A middleware either returns a response (short-circuit) or runs `next`.
type Middleware = Context -> Next -> Aff (Maybe Response)

foreign import newApp :: Effect App

new :: Effect App
new = newApp

foreign import onImpl :: EffectFn3 App String (EffectFn1 Context (Promise Response)) Unit
foreign import methodImpl :: String -> EffectFn3 App String (EffectFn1 Context (Promise Response)) Unit

register :: String -> App -> String -> Handler -> Effect Unit
register m app path h = runEffectFn3 (methodImpl m) app path (mkEffectFn1 \c -> fromAff (h c))

get :: App -> String -> Handler -> Effect Unit
get = register "get"

post :: App -> String -> Handler -> Effect Unit
post = register "post"

put :: App -> String -> Handler -> Effect Unit
put = register "put"

patch :: App -> String -> Handler -> Effect Unit
patch = register "patch"

delete :: App -> String -> Handler -> Effect Unit
delete = register "delete"

all :: App -> String -> Handler -> Effect Unit
all = register "all"

-- | `app.route(path, sub)`.
foreign import route :: App -> String -> App -> Effect Unit

foreign import useImpl :: EffectFn3 App String (EffectFn2 Context (Effect (Promise Unit)) (Promise (Nullable Response))) Unit

-- | `app.use(path, middleware)`.
usePath :: App -> String -> Middleware -> Effect Unit
usePath app path mw = runEffectFn3 useImpl app path
  (mkEffectFn2 \c next -> fromAff (toNullableM <$> mw c (toAffE next)))

-- | `app.use("*", middleware)`.
use :: App -> Middleware -> Effect Unit
use app = usePath app "*"

foreign import toNullableM :: forall a. Maybe a -> Nullable a

-- | `app.fetch`, for `@hono/node-server`.
foreign import fetchHandler :: App -> Foreign

foreign import onErrorImpl :: EffectFn2 App (EffectFn2 Foreign Context (Promise Response)) Unit

onError :: App -> (Foreign -> Context -> Aff Response) -> Effect Unit
onError app f = runEffectFn2 onErrorImpl app (mkEffectFn2 \e c -> fromAff (f e c))

foreign import notFoundImpl :: EffectFn2 App (EffectFn1 Context (Promise Response)) Unit

notFound :: App -> Handler -> Effect Unit
notFound app h = runEffectFn2 notFoundImpl app (mkEffectFn1 \c -> fromAff (h c))

-- Request --------------------------------------------------------------------

foreign import reqHeaderImpl :: Context -> String -> Nullable String

reqHeader :: Context -> String -> Maybe String
reqHeader c k = toMaybe (reqHeaderImpl c k)

-- | `c.req.raw.headers.get(name)`.
foreign import reqRawHeaderImpl :: Context -> String -> Nullable String

reqRawHeader :: Context -> String -> Maybe String
reqRawHeader c k = toMaybe (reqRawHeaderImpl c k)

-- | `c.req.param(name)`; "" when absent.
foreign import reqParam :: Context -> String -> String

foreign import reqQueryImpl :: Context -> String -> Nullable String

reqQuery :: Context -> String -> Maybe String
reqQuery c k = toMaybe (reqQueryImpl c k)

-- | `c.req.queries(name)`: every value of a repeated query key.
foreign import reqQueries :: Context -> String -> Array String

foreign import reqJsonImpl :: Context -> Effect (Promise Foreign)

reqJson :: Context -> Aff Foreign
reqJson c = toAffE (reqJsonImpl c)

foreign import reqTextImpl :: Context -> Effect (Promise String)

reqText :: Context -> Aff String
reqText c = toAffE (reqTextImpl c)

foreign import reqFormDataImpl :: Context -> Effect (Promise FormData)

reqFormData :: Context -> Aff FormData
reqFormData c = toAffE (reqFormDataImpl c)

foreign import reqArrayBufferImpl :: Context -> Effect (Promise Buffer)

reqArrayBuffer :: Context -> Aff Buffer
reqArrayBuffer c = toAffE (reqArrayBufferImpl c)

foreign import reqMethod :: Context -> String
foreign import reqPath :: Context -> String
foreign import reqUrl :: Context -> String

foreign import formGetImpl :: FormData -> String -> Nullable String

-- | A string field of the form.
formGet :: FormData -> String -> Maybe String
formGet f k = toMaybe (formGetImpl f k)

foreign import formGetFileImpl :: FormData -> String -> Nullable FormFile

-- | A file field of the form.
formGetFile :: FormData -> String -> Maybe FormFile
formGetFile f k = toMaybe (formGetFileImpl f k)

foreign import fileName :: FormFile -> String
foreign import fileType :: FormFile -> String
foreign import fileSize :: FormFile -> Number
foreign import fileBufferImpl :: FormFile -> Effect (Promise Buffer)

fileBuffer :: FormFile -> Aff Buffer
fileBuffer f = toAffE (fileBufferImpl f)

-- Response -------------------------------------------------------------------

-- | `c.status(code)`; affects the next `json`/`text`.
foreign import status :: Context -> Int -> Effect Unit

foreign import setHeader :: Context -> String -> String -> Effect Unit

-- | `c.json(value)` with the status set earlier (default 200).
foreign import json :: Context -> Foreign -> Effect Response

-- | `c.json(value, status)`.
foreign import jsonWith :: Context -> Foreign -> Int -> Effect Response

foreign import text :: Context -> String -> Effect Response
foreign import textWith :: Context -> String -> Int -> Effect Response
foreign import html :: Context -> String -> Effect Response

-- | `c.redirect(url, status)`.
foreign import redirect :: Context -> String -> Int -> Effect Response

-- | `c.body(data, status, headers)` with a foreign body (stream, buffer, …).
foreign import body :: Context -> Foreign -> Int -> Object String -> Effect Response

bodyBuffer :: Context -> Buffer -> Int -> Object String -> Effect Response
bodyBuffer c b = body c (toForeign b)

foreign import toForeign :: forall a. a -> Foreign

-- | Return a web `Response` built elsewhere (e.g. with `Fetch.webResponse`).
foreign import rawResponse :: Fetch.Response -> Response

foreign import notFoundResponse :: Context -> Effect Response

-- | `c.set(key, value)` / `c.get(key)`.
foreign import setVar :: Context -> String -> Foreign -> Effect Unit
foreign import getVarImpl :: Context -> String -> Effect (Nullable Foreign)

getVar :: Context -> String -> Effect (Maybe Foreign)
getVar c k = toMaybe <$> getVarImpl c k

-- | Raw FormData.get, preserving string entries and missing fields.
foreign import formValue :: FormData -> String -> Foreign

foreign import fileTextImpl :: Foreign -> Effect (Promise String)

fileText :: Foreign -> Aff String
fileText file = toAffE (fileTextImpl file)

options :: App -> String -> Handler -> Effect Unit
options = register "options"
