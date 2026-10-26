module Rocksky.Client
  ( Client
  , Config
  , defaultConfig
  , newClient
  , withToken
  , RockskyError(..)
  , HttpError
  , query
  , procedure
  , request
  ) where

import Prelude
import Data.Argonaut.Core (Json, jsonNull)
import Data.Argonaut.Decode (class DecodeJson, decodeJson, printJsonDecodeError)
import Data.Argonaut.Encode (class EncodeJson, encodeJson)
import Data.Argonaut.Parser (jsonParser)
import Data.Either (Either(..))
import Data.Maybe (Maybe(..), fromMaybe)
import Effect.Aff (Aff, attempt)
import Effect.Aff.Compat (EffectFnAff, fromEffectFnAff)
import Effect.Exception (message)

type Config =
  { baseUrl :: String
  , token :: Maybe String
  , timeoutMs :: Int
  }

newtype Client = Client Config

defaultConfig :: Config
defaultConfig =
  { baseUrl: "https://api.rocksky.app"
  , token: Nothing
  , timeoutMs: 30000
  }

newClient :: Config -> Client
newClient = Client

withToken :: String -> Client -> Client
withToken token (Client config) = Client (config { token = Just token })

type HttpError =
  { status :: Int
  , error :: Maybe String
  , message :: Maybe String
  , body :: String
  }

data RockskyError
  = TransportError String
  | ResponseError HttpError
  | DecodeError String

instance showRockskyError :: Show RockskyError where
  show (TransportError reason) = "TransportError: " <> reason
  show (ResponseError err) = "HTTP " <> show err.status <> ": " <> fromMaybe "Request failed" err.message
  show (DecodeError reason) = "DecodeError: " <> reason

type Response = { status :: Int, body :: String }

foreign import fetchImpl
  :: String
  -> String
  -> String
  -> Int
  -> String
  -> Json
  -> Json
  -> Boolean
  -> EffectFnAff Response

-- | Generic XRPC escape hatch. Nothing omits the request body entirely.
-- | A successful empty response is represented by JSON null.
request :: Client -> String -> String -> Json -> Maybe Json -> Aff (Either RockskyError Json)
request (Client config) method nsid params body = do
  result <- attempt $ fromEffectFnAff $ fetchImpl config.baseUrl
    (fromMaybe "" config.token)
    method
    config.timeoutMs
    nsid
    params
    (fromMaybe jsonNull body)
    ( case body of
        Nothing -> false
        Just _ -> true
    )
  pure case result of
    Left err -> Left $ TransportError $ message err
    Right response
      | response.status < 200 || response.status >= 300 ->
          let
            details = case jsonParser response.body of
              Left _ -> { error: Nothing, message: Nothing }
              Right json -> case decodeJson json of
                Left _ -> { error: Nothing, message: Nothing }
                Right value -> value
          in
            Left $ ResponseError
              { status: response.status
              , error: details.error
              , message: details.message
              , body: response.body
              }
      | response.body == "" -> Right jsonNull
      | otherwise -> case jsonParser response.body of
          Left err -> Left $ DecodeError err
          Right json -> Right json

decodeResponse :: forall a. DecodeJson a => Either RockskyError Json -> Either RockskyError a
decodeResponse (Left err) = Left err
decodeResponse (Right json) = case decodeJson json of
  Left err -> Left $ DecodeError $ printJsonDecodeError err
  Right value -> Right value

query
  :: forall params output
   . EncodeJson params
  => DecodeJson output
  => Client
  -> String
  -> params
  -> Aff (Either RockskyError output)
query client nsid params = decodeResponse <$> request client "GET" nsid (encodeJson params) Nothing

procedure
  :: forall params input output
   . EncodeJson params
  => EncodeJson input
  => DecodeJson output
  => Client
  -> String
  -> params
  -> Maybe input
  -> Aff (Either RockskyError output)
procedure client nsid params input = decodeResponse <$>
  request client "POST" nsid (encodeJson params) (encodeJson <$> input)
