module CI.Runtime (runModule) where

import Prelude
import CI.Module as M
import CI.Docker.Engine as E
import Data.Argonaut.Parser (jsonParser)
import Data.Array (concatMap, find)
import Data.Maybe (Maybe(..))
import Data.Either (Either(..))
import Effect (Effect)
import Effect.Exception (throw, try, throwException)
import FluentCI.Plugin as P

runModule :: Array M.ObjectDefinition -> String -> Effect Unit
runModule definitions name = do
  raw <- E.unwrap P.input
  parsed <- case jsonParser (if raw == "" then "{}" else raw) of
    Left problem -> throw ("Expected a JSON object: " <> problem)
    Right value -> M.json value
  handler <- case find (\f -> f.name == name) (concatMap _.functions definitions) of
    Nothing -> throw ("Unknown CI function: " <> name)
    Just value -> pure value
  client <- E.createClient
  outcome <- try (handler.run client parsed)
  E.cleanup client
  case outcome of
    Left failure -> throwException failure
    Right value -> E.unwrap (P.output value)
