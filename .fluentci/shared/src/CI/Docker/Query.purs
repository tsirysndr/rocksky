module CI.Docker.Query where

import CI.Docker.Types
import Data.Maybe (Maybe(..))
import Foreign.Object as Object

container :: Client -> Container
container = containerWith defaultContainerOpts

defaultContainerOpts :: { platform :: Maybe Platform }
defaultContainerOpts = { platform: Nothing }

containerWith :: { platform :: Maybe Platform } -> Client -> Container
containerWith opts client = Container { client, image: "", platform: opts.platform, cwd: "/", env: Object.empty, secrets: Object.empty, mounts: Object.empty, operations: [] }

cacheVolume :: String -> Client -> CacheVolume
cacheVolume name _ = CacheVolume name

directory :: Client -> Directory
directory _ = NewDirectory []
