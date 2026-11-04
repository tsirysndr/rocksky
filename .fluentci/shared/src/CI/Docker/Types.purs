module CI.Docker.Types where

import Prelude
import Data.Maybe (Maybe)
import Effect.Ref (Ref)
import Foreign.Object (Object)

data Platform = Platform String

derive instance eqPlatform :: Eq Platform

data ReturnType = ReturnTypeAny

type State =
  { containers :: Object String
  , snapshots :: Object String
  , heads :: Object String
  , outputs :: Object String
  , resources :: Array String
  , images :: Array String
  , services :: Object String
  , counter :: Int
  }

type Client = { state :: Ref State, network :: String, temporary :: String, root :: String }

newtype Secret = Secret { name :: String, value :: String }
newtype CacheVolume = CacheVolume String

newtype Container = Container
  { client :: Client
  , image :: String
  , platform :: Maybe Platform
  , cwd :: String
  , env :: Object String
  , secrets :: Object Secret
  , mounts :: Object CacheVolume
  , operations :: Array Operation
  }

data Directory = HostDirectory String | ContainerDirectory Container String | NewDirectory (Array { path :: String, file :: File, permissions :: Maybe Int })
data File = HostFile String | ContainerFile Container String | DirectoryFile Directory String

data Operation
  = Execute { args :: Array String, cwd :: String, env :: Object String, secrets :: Object Secret, stdin :: Maybe String, redirectStdout :: Maybe String, anyExit :: Boolean }
  | CopyDirectory String Directory { include :: Maybe (Array String), exclude :: Maybe (Array String) }
  | CopyFile String File (Maybe Int)
  | WriteFile String String
  | BindService String Service
  | RegistryAuth String String Secret

newtype Service = Service { container :: Container, args :: Maybe (Array String), useEntrypoint :: Maybe Boolean }
