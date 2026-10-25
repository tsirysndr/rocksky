module Rocksky.AppProxy.Web where

import Prelude
import Control.Promise (Promise, toAffE)
import Data.Nullable (Nullable)
import Effect (Effect)
import Effect.Aff (Aff)

foreign import data Request :: Type
foreign import data Response :: Type
foreign import data Environment :: Type

type Header = { name :: String, value :: String }
type Info = { url :: String, pathname :: String, search :: String, method :: String }
type OgData = { title :: String, description :: String, image :: String, url :: Nullable String, type :: Nullable String, twitterCard :: Nullable String }

foreign import info :: Request -> Info
foreign import requestHeader :: Request -> String -> String
foreign import envValue :: Environment -> String -> String
foreign import query :: Request -> String -> Nullable String
foreign import matches :: String -> String -> Boolean
foreign import replaceAll :: String -> String -> String -> String
foreign import decode :: String -> String
foreign import changeHost :: Request -> String -> String
foreign import changePath :: Request -> String -> String
foreign import ogUrl :: Request -> String
foreign import status :: Response -> Int
foreign import responseHeader :: Response -> String -> String
foreign import response :: Int -> String -> Array Header -> Boolean -> Effect Response
foreign import jsonResponse :: forall a. a -> Array Header -> Effect Response
foreign import modifyResponse :: Response -> Array Header -> Array String -> Boolean -> Effect Response
foreign import fetchImpl :: String -> Request -> Boolean -> Effect (Promise Response)
foreign import fetchStaticImpl :: String -> String -> Array Header -> Boolean -> Effect (Promise Response)
foreign import fetchGetImpl :: String -> Effect (Promise Response)
foreign import readOgImpl :: Response -> Effect (Promise OgData)
foreign import rewrite :: Response -> String -> Effect Response

fetch :: String -> Request -> Boolean -> Aff Response
fetch url request bypass = toAffE (fetchImpl url request bypass)

fetchStatic :: String -> String -> Array Header -> Boolean -> Aff Response
fetchStatic url method headers bypass = toAffE (fetchStaticImpl url method headers bypass)

readOg :: Response -> Aff OgData
readOg = toAffE <<< readOgImpl

header :: String -> String -> Header
header name value = { name, value }

fetchGet :: String -> Aff Response
fetchGet = toAffE <<< fetchGetImpl
