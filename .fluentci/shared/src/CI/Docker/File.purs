module CI.Docker.File where

import Prelude
import CI.Docker.Types
import CI.Docker.Container as C
import CI.Docker.Directory as D
import CI.Docker.Engine as E
import Effect (Effect)
import Effect.Exception (throw)

contents :: File -> Effect String
contents = case _ of
  HostFile path -> E.run ["cat", "--", path]
  ContainerFile container path -> C.stdout (container # C.withExec ["cat", "--", path])
  DirectoryFile (HostDirectory path) file -> E.run ["cat", "--", path <> "/" <> file]
  DirectoryFile (ContainerDirectory container path) file -> C.stdout (container # C.withExec ["cat", "--", path <> "/" <> file])
  _ -> throw "Cannot read an unstaged virtual file"
