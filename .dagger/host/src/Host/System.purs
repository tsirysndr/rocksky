module Host.System where

import Prelude
import Data.Array (uncons)
import Data.Maybe (Maybe(..))
import Data.String (trim)
import Effect (Effect)
import Effect.Exception (throw, try, throwException)
import Data.Either (Either(..))

foreign import args :: Effect (Array String)
foreign import platform :: Effect String
foreign import arch :: Effect String
foreign import cwd :: Effect String
foreign import env :: String -> Effect String
foreign import setEnv :: String -> String -> Effect Unit
foreign import read :: String -> Effect String
foreign import write :: String -> String -> Effect Unit
foreign import append :: String -> String -> Effect Unit
foreign import mkdir :: String -> Effect Unit
foreign import temporary :: Effect String
foreign import remove :: String -> Effect Unit
foreign import exists :: String -> Effect Boolean
foreign import entries :: String -> Effect (Array String)
foreign import copy :: String -> String -> Effect Unit
foreign import sha256 :: String -> Effect String
foreign import execute :: Boolean -> String -> String -> Array String -> Effect { code :: Int, output :: String }

run :: Boolean -> String -> Array String -> Effect String
run capture dir command = case uncons command of
  Nothing -> throw "Empty command"
  Just { head, tail } -> do
    result <- execute capture dir head tail
    when (result.code /= 0) $ throw (head <> " failed: " <> show result.code)
    pure result.output

root :: Effect String
root = do
  workspace <- env "GITHUB_WORKSPACE"
  if workspace /= "" then pure workspace else do
    directory <- cwd
    trim <$> run true directory [ "git", "rev-parse", "--show-toplevel" ]

required :: String -> Effect String
required name = do
  value <- env name
  if value == "" then throw ("Missing environment variable " <> name) else pure value

finally :: forall a. Effect Unit -> Effect a -> Effect a
finally cleanup action = do
  result <- try action
  cleanup
  case result of
    Left failure -> throwException failure
    Right value -> pure value
