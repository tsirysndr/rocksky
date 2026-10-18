module Rocksky.Types.AccessToken (CreateAccessTokenInput, parseCreateAccessToken) where

import Prelude

import Data.Either (Either)
import Foreign (Foreign)
import Rocksky.Lib.Validate (FieldError, field, maxLength, minLength, object, run, string, trimmed)

type CreateAccessTokenInput = { name :: String }

parseCreateAccessToken :: Foreign -> Either (Array FieldError) CreateAccessTokenInput
parseCreateAccessToken = run $ object \o -> { name: _ }
  <$> field "name" (maxLength 120 (minLength 1 (trimmed string))) o
