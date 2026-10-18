module Rocksky.Types.ApiKey (ApiKey, parseApiKey) where

import Prelude

import Data.Either (Either)
import Data.Maybe (Maybe)
import Data.Nullable (Nullable)
import Foreign (Foreign)
import Rocksky.Lib.Validate (FieldError, boolean, field, nonEmpty, object, optional, optionalNullable, run, string)

type ApiKey = { name :: String, description :: Nullable String, enabled :: Maybe Boolean }

parseApiKey :: Foreign -> Either (Array FieldError) ApiKey
parseApiKey = run $ object \o -> { name: _, description: _, enabled: _ }
  <$> field "name" (nonEmpty string) o
  <*> optionalNullable "description" string o
  <*> optional "enabled" boolean o
