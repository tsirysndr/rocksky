module CI.Module where

import Prelude
import CI.Docker.Types
import CI.Docker.Engine as E
import CI.Docker.Query as Q
import CI.Docker.Container as C
import Data.Argonaut.Core (Json)
import Data.Argonaut.Decode (class DecodeJson, decodeJson, printJsonDecodeError)
import Data.Either (Either(..))
import Data.Maybe (Maybe(..))
import Data.String (Pattern(..), stripPrefix)
import Effect (Effect)
import Effect.Exception (throw)
import FluentCI.Plugin as P
import Foreign.Object (Object)
import Foreign.Object as Object

newtype Arguments a = Arguments (Client -> Object Json -> Effect a)
instance functorArguments :: Functor Arguments where
  map f (Arguments read) = Arguments (\client input -> f <$> read client input)
instance applyArguments :: Apply Arguments where
  apply (Arguments f) (Arguments a) = Arguments (\client input -> f client input <*> a client input)
instance applicativeArguments :: Applicative Arguments where
  pure a = Arguments (\_ _ -> pure a)

class FromArgument a where
  fromArgument :: Client -> Json -> Effect a

json :: forall a. DecodeJson a => Json -> Effect a
json value = case decodeJson value of
  Left failure -> throw (printJsonDecodeError failure)
  Right result -> pure result

instance stringArgument :: FromArgument String where
  fromArgument _ = json
instance booleanArgument :: FromArgument Boolean where
  fromArgument _ = json
instance directoryArgument :: FromArgument Directory where
  fromArgument client value = HostDirectory <<< E.absolute client <$> json value
instance fileArgument :: FromArgument File where
  fromArgument client value = HostFile <<< E.absolute client <$> json value
instance secretArgument :: FromArgument Secret where
  fromArgument _ value = do
    reference <- json value
    case stripPrefix (Pattern "env://") reference of
      Nothing -> throw "Secret arguments must use env://VARIABLE references"
      Just name -> do
        secret <- E.unwrap (P.getEnv name)
        pure (Secret { name, value: secret })
instance containerArgument :: FromArgument Container where
  fromArgument client value = do
    image <- json value
    pure $ Q.container client # C.from image

argument :: forall a. FromArgument a => String -> Arguments a
argument name = Arguments \client input -> case Object.lookup name input of
  Nothing -> throw ("Missing argument: " <> name)
  Just value -> fromArgument client value

defaultArgument :: forall a. FromArgument a => String -> a -> Arguments a
defaultArgument name fallback = Arguments \client input -> case Object.lookup name input of
  Nothing -> pure fallback
  Just value -> fromArgument client value

class Result a where
  result :: Client -> String -> Object Json -> a -> Effect String
instance stringResult :: Result String where
  result _ _ _ value = pure value
instance fileResult :: Result File where
  result client job input file = do
    path <- outputPath client job input
    source <- E.exportFile client file
    void $ E.run ["sh", "-c", "mkdir -p -- \"$(dirname -- \"$1\")\"", "sh", path]
    void $ E.run ["cp", source, path]
    pure path
instance directoryResult :: Result Directory where
  result client job input directory = do
    path <- outputPath client job input
    source <- E.exportDirectory client directory
    void $ E.run ["mkdir", "-p", path]
    void $ E.run ["rsync", "-a", "--", source <> "/", path <> "/"]
    pure path
instance containerResult :: Result Container where
  result client job input container = do
    built <- E.materialize container
    name <- case Object.lookup "output" input of
      Nothing -> pure ("rocksky-fluentci/" <> job <> ":local")
      Just value -> json value
    E.commitExport client built.id container name
    pure name

outputPath :: Client -> String -> Object Json -> Effect String
outputPath client job input = case Object.lookup "output" input of
  Nothing -> pure (client.root <> "/dist/fluentci/" <> job)
  Just value -> E.absolute client <$> json value

type FunctionDefinition = { name :: String, description :: String, run :: Client -> Object Json -> Effect String }
type ObjectDefinition = { functions :: Array FunctionDefinition }
function :: forall a b. Result b => String -> String -> Arguments a -> (Client -> a -> Effect b) -> FunctionDefinition
function name description (Arguments parse) handler = { name, description, run: \client input -> do
  args <- parse client input
  value <- handler client args
  result client name input value }
object_ :: String -> {} -> Array FunctionDefinition -> ObjectDefinition
object_ _ _ functions = { functions }
