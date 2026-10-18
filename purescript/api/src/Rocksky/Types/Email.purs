module Rocksky.Types.Email (Email, parseEmail) where

import Prelude

import Data.Either (Either)
import Foreign (Foreign)
import Rocksky.Lib.Validate (FieldError, email, field, nonEmpty, object, run, string)

type Email = { email :: String }

parseEmail :: Foreign -> Either (Array FieldError) Email
parseEmail = run $ object \o -> { email: _ } <$> field "email" (email (nonEmpty string)) o
