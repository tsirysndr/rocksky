-- | Minimal bindings for the global `fetch` (undici) in Node.js.
module Fetch
  ( Response
  , Request
  , fetch
  , fetchWith
  , urlEncoded
  , FetchOptions
  , defaultOptions
  , status
  , ok
  , header
  , headersObject
  , text
  , json
  , arrayBuffer
  , bodyStream
  , url
  , webResponse
  , webResponseFromBuffer
  , timeoutSignal
  , AbortSignal
  , readableToBuffer
  ) where

import Prelude

import Control.Promise (Promise, toAffE)
import Data.Maybe (Maybe)
import Data.Nullable (Nullable, toMaybe, null)
import Effect (Effect)
import Effect.Aff (Aff)
import Effect.Uncurried (EffectFn2, runEffectFn2)
import Foreign (Foreign)
import Foreign.Object (Object)
import Node.Buffer (Buffer)

foreign import data Response :: Type
foreign import data Request :: Type
foreign import data AbortSignal :: Type

type FetchOptions =
  { method :: String
  , headers :: Object String
  , body :: Nullable Foreign
  , redirect :: String
  , signal :: Nullable AbortSignal
  }

defaultOptions :: FetchOptions
defaultOptions = { method: "GET", headers: mempty, body: null, redirect: "follow", signal: null }

foreign import fetchImpl :: EffectFn2 String FetchOptions (Promise Response)

fetch :: String -> Aff Response
fetch u = fetchWith u defaultOptions

fetchWith :: String -> FetchOptions -> Aff Response
fetchWith u o = toAffE (runEffectFn2 fetchImpl u o)

foreign import status :: Response -> Int
foreign import ok :: Response -> Boolean
foreign import headerImpl :: Response -> String -> Nullable String

header :: Response -> String -> Maybe String
header r k = toMaybe (headerImpl r k)

foreign import headersObject :: Response -> Object String
foreign import url :: Response -> String

foreign import textImpl :: Response -> Effect (Promise String)
foreign import jsonImpl :: Response -> Effect (Promise Foreign)
foreign import arrayBufferImpl :: Response -> Effect (Promise Buffer)

text :: Response -> Aff String
text r = toAffE (textImpl r)

json :: Response -> Aff Foreign
json r = toAffE (jsonImpl r)

-- | The body as a Node `Buffer`.
arrayBuffer :: Response -> Aff Buffer
arrayBuffer r = toAffE (arrayBufferImpl r)

-- | The raw web `ReadableStream` body (for piping into another Response).
foreign import bodyStream :: Response -> Foreign

-- | `new Response(body, { status, headers })` with a foreign body.
foreign import webResponse :: Foreign -> Int -> Object String -> Effect Response

foreign import webResponseFromBuffer :: Buffer -> Int -> Object String -> Effect Response

-- | `AbortSignal.timeout(ms)`.
foreign import timeoutSignal :: Int -> Effect AbortSignal

foreign import readableToBufferImpl :: Foreign -> Effect (Promise Buffer)

-- | Drain a web `ReadableStream` into a `Buffer`.
readableToBuffer :: Foreign -> Aff Buffer
readableToBuffer s = toAffE (readableToBufferImpl s)

-- | URLSearchParams form serialization.
foreign import urlEncoded :: Object String -> String
