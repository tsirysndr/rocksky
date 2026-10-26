module Rocksky.Feeds.Auth where

import Prelude
import Control.Promise (Promise, toAffE)
import Data.Either (either)
import Data.Maybe (Maybe(..))
import Data.String (Pattern(..), stripPrefix, trim)
import Effect (Effect)
import Effect.Aff (Aff, try)

foreign import verifyImpl :: String -> Effect (Promise String)

optionalWith :: (String -> Aff String) -> String -> Aff (Maybe String)
optionalWith verify header = case stripPrefix (Pattern "Bearer ") header of
  Nothing -> pure Nothing
  Just token -> either (const Nothing) Just <$> try (verify (trim token))

optional :: String -> Aff (Maybe String)
optional = optionalWith (toAffE <<< verifyImpl)
