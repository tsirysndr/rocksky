module CI.Docker.Directory where

import Prelude
import CI.Docker.Types
import CI.Docker.Engine as E
import CI.Docker.Query as Q
import CI.Docker.Container as C
import Data.Array (filter)
import Data.Maybe (Maybe(..))
import Data.String (Pattern(..), split)
import Effect (Effect)

file :: String -> Directory -> File
file path directory = DirectoryFile directory path

-- Host directories are resolved by CI.Module before these functions are called.
entries :: Directory -> Effect (Array String)
entries = case _ of
  ContainerDirectory container path -> do
    output <- C.stdout (container # C.withExec ["find", path, "-mindepth", "1", "-maxdepth", "1", "-printf", "%f\n"])
    pure $ filter (_ /= "") (split (Pattern "\n") output)
  HostDirectory path -> do
    output <- E.run ["find", path, "-mindepth", "1", "-maxdepth", "1", "-exec", "basename", "{}", ";"]
    pure $ filter (_ /= "") (split (Pattern "\n") output)
  NewDirectory files -> pure (map _.path files)

defaultWithFileOpts :: { permissions :: Maybe Int }
defaultWithFileOpts = { permissions: Nothing }

withFileWith :: String -> File -> { permissions :: Maybe Int } -> Directory -> Directory
withFileWith path file opts (NewDirectory files) = NewDirectory (files <> [{ path, file, permissions: opts.permissions }])
withFileWith _ _ _ source = source
