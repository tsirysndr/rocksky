-- Synchronous effects are required by the Extism guest ABI.
module CI.Effect (Aff, throwError, catchError, bracket, attempt, launchAff_) where

import Prelude
import Data.Either (Either(..))
import Effect (Effect)
import Effect.Exception (Error, try, throwException, catchException)

type Aff a = Effect a

throwError :: forall a. Error -> Effect a
throwError = throwException

catchError :: forall a. Effect a -> (Error -> Effect a) -> Effect a
catchError action handler = catchException handler action

attempt :: forall a. Effect a -> Effect (Either Error a)
attempt = try

launchAff_ :: Effect Unit -> Effect Unit
launchAff_ = identity

bracket :: forall a b c. Effect a -> (a -> Effect b) -> (a -> Effect c) -> Effect c
bracket acquire release action = do
  resource <- acquire
  result <- try (action resource)
  _ <- release resource
  case result of
    Left failure -> throwException failure
    Right value -> pure value
