-- | Bindings for `axios`: instances with a base URL and timeout, the verbs,
-- | and typed access to the response.
module Axios
  ( Instance
  , Response
  , Config
  , defaultConfig
  , create
  , get
  , getWith
  , post
  , postWith
  , AbortSignal
  , postWithSignal
  , put
  , delete
  , head
  , postForm
  , RequestOptions
  , defaultRequestOptions
  , data_
  , status
  , headers
  , isAxiosError
  , errorStatus
  , errorData
  , errorMessage
  ) where

import Prelude

import Control.Promise (Promise, toAffE)
import Data.Maybe (Maybe)
import Data.Nullable (Nullable, toMaybe, null)
import Effect (Effect)
import Effect.Aff (Aff)
import Effect.Exception (Error)
import Foreign (Foreign)
import Foreign.Object (Object)

foreign import data Instance :: Type
foreign import data Response :: Type

type Config = { baseURL :: String, timeout :: Nullable Int }

defaultConfig :: String -> Config
defaultConfig baseURL = { baseURL, timeout: null }

-- | `axios.create(config)`.
foreign import create :: Config -> Effect Instance

-- | The default instance (`axios` itself).
foreign import global :: Instance

type RequestOptions =
  { headers :: Object String
  , params :: Nullable Foreign
  , timeout :: Nullable Int
  , responseType :: Nullable String
  , maxRedirects :: Nullable Int
  , validateStatus :: Boolean
  }

-- | No extra headers, default timeout, reject non-2xx (as axios does).
defaultRequestOptions :: RequestOptions
defaultRequestOptions =
  { headers: mempty, params: null, timeout: null, responseType: null, maxRedirects: null, validateStatus: true }

foreign import requestImpl :: Instance -> String -> String -> Nullable Foreign -> RequestOptions -> Effect (Promise Response)

get :: Instance -> String -> Aff Response
get i u = getWith i u defaultRequestOptions

getWith :: Instance -> String -> RequestOptions -> Aff Response
getWith i u o = toAffE (requestImpl i "get" u null o)

post :: Instance -> String -> Foreign -> Aff Response
post i u b = postWith i u b defaultRequestOptions

postWith :: Instance -> String -> Foreign -> RequestOptions -> Aff Response
postWith i u b o = toAffE (requestImpl i "post" u (toNullableImpl b) o)

put :: Instance -> String -> Foreign -> RequestOptions -> Aff Response
put i u b o = toAffE (requestImpl i "put" u (toNullableImpl b) o)

delete :: Instance -> String -> RequestOptions -> Aff Response
delete i u o = toAffE (requestImpl i "delete" u null o)

head :: Instance -> String -> RequestOptions -> Aff Response
head i u o = toAffE (requestImpl i "head" u null o)

foreign import toNullableImpl :: Foreign -> Nullable Foreign

foreign import postFormImpl :: Instance -> String -> Object String -> RequestOptions -> Effect (Promise Response)

-- | `axios.postForm(url, fields)`: urlencoded/multipart form body.
postForm :: Instance -> String -> Object String -> RequestOptions -> Aff Response
postForm i u f o = toAffE (postFormImpl i u f o)

foreign import data_ :: Response -> Foreign
foreign import status :: Response -> Int
foreign import headers :: Response -> Object String

foreign import isAxiosError :: Error -> Boolean

foreign import errorStatusImpl :: Error -> Nullable Int

-- | `error.response?.status`.
errorStatus :: Error -> Maybe Int
errorStatus = toMaybe <<< errorStatusImpl

foreign import errorDataImpl :: Error -> Nullable Foreign

-- | `error.response?.data`.
errorData :: Error -> Maybe Foreign
errorData = toMaybe <<< errorDataImpl

foreign import errorMessage :: Error -> String

foreign import data AbortSignal :: Type
foreign import postWithSignalImpl :: Instance -> String -> Foreign -> Nullable AbortSignal -> Effect (Promise Response)

postWithSignal :: Instance -> String -> Foreign -> Nullable AbortSignal -> Aff Response
postWithSignal i u b s = toAffE (postWithSignalImpl i u b s)
