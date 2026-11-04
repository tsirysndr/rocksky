module CI.Docker.Container where

import Prelude
import CI.Docker.Types
import CI.Docker.Engine as E
import Data.Array (null)
import Data.Foldable (traverse_)
import Data.Maybe (Maybe(..), fromMaybe)
import Data.String (Pattern(..), Replacement(..), replaceAll, trim)
import Data.Traversable as Data.Traversable
import Effect.Ref as Ref
import Effect (Effect)
import Foreign.Object as Object

from :: String -> Container -> Container
from image (Container c) = Container (c { image = image })

withWorkdir :: String -> Container -> Container
withWorkdir cwd container@(Container c) = addOperation (Execute { args: ["mkdir", "-p", cwd], cwd: "/", env: c.env, secrets: c.secrets, stdin: Nothing, redirectStdout: Nothing, anyExit: false }) container
  # setWorkdir
  where
  setWorkdir (Container value) = Container (value { cwd = cwd })

withEnvVariable :: String -> String -> Container -> Container
withEnvVariable key value (Container c) = Container (c { env = Object.insert key value c.env })

defaultWithEnvVariableOpts :: { expand :: Maybe Boolean }
defaultWithEnvVariableOpts = { expand: Nothing }

withEnvVariableWith :: String -> String -> { expand :: Maybe Boolean } -> Container -> Container
withEnvVariableWith key value _ = withEnvVariable key value

withoutEnvVariable :: String -> Container -> Container
withoutEnvVariable key (Container c) = Container (c { env = Object.delete key c.env })

withSecretVariable :: String -> Secret -> Container -> Container
withSecretVariable key value (Container c) = Container (c { secrets = Object.insert key value c.secrets })

withMountedCache :: String -> CacheVolume -> Container -> Container
withMountedCache path cache (Container c) = Container (c { mounts = Object.insert path cache c.mounts })

addOperation :: Operation -> Container -> Container
addOperation op (Container c) = Container (c { operations = c.operations <> [op] })

defaultWithExecOpts :: { stdin :: Maybe String, redirectStdout :: Maybe String, expect :: Maybe ReturnType }
defaultWithExecOpts = { stdin: Nothing, redirectStdout: Nothing, expect: Nothing }

withExec :: Array String -> Container -> Container
withExec args = withExecWith args defaultWithExecOpts

withExecWith :: Array String -> { stdin :: Maybe String, redirectStdout :: Maybe String, expect :: Maybe ReturnType } -> Container -> Container
withExecWith args opts container@(Container c) = addOperation (Execute { args, cwd: c.cwd, env: c.env, secrets: c.secrets, stdin: opts.stdin, redirectStdout: opts.redirectStdout, anyExit: case opts.expect of
  Nothing -> false
  Just _ -> true }) container

defaultWithDirectoryOpts :: { include :: Maybe (Array String), exclude :: Maybe (Array String) }
defaultWithDirectoryOpts = { include: Nothing, exclude: Nothing }

withDirectory :: String -> Directory -> Container -> Container
withDirectory path source = withDirectoryWith path source defaultWithDirectoryOpts

withDirectoryWith :: String -> Directory -> { include :: Maybe (Array String), exclude :: Maybe (Array String) } -> Container -> Container
withDirectoryWith path source opts = addOperation (CopyDirectory path source opts)

withFile :: String -> File -> Container -> Container
withFile path source = addOperation (CopyFile path source Nothing)

withNewFile :: String -> String -> Container -> Container
withNewFile path value = addOperation (WriteFile path value)

-- Write the secret through stdin; it never becomes command-line text.
withMountedSecret :: String -> Secret -> Container -> Container
withMountedSecret path secret container = container
  # withSecretVariable "CI_MOUNTED_SECRET" secret
  # withExec ["sh", "-c", "umask 077; mkdir -p -- \"$(dirname -- \"$1\")\"; printf '%s' \"$CI_MOUNTED_SECRET\" > \"$1\"", "sh", path]

withoutDirectory :: String -> Container -> Container
withoutDirectory path = withExec [ "rm", "-rf", "--", path ]

directory :: String -> Container -> Directory
directory path container = ContainerDirectory container path

file :: String -> Container -> File
file path container = ContainerFile container path

stdout :: Container -> Effect String
stdout = map _.output <<< E.materialize

sync :: Container -> Effect Container
sync container = E.materialize container $> container

exists :: String -> Container -> Effect Boolean
exists path container = do
  value <- stdout (container # withExec ["sh", "-c", "if test -e \"$1\"; then printf yes; else printf no; fi", "sh", path])
  pure (trim value == "yes")

withExposedPort :: Int -> Container -> Container
withExposedPort _ = identity

defaultAsServiceOpts :: { args :: Maybe (Array String), useEntrypoint :: Maybe Boolean }
defaultAsServiceOpts = { args: Nothing, useEntrypoint: Nothing }

asService :: Container -> Service
asService = asServiceWith defaultAsServiceOpts

asServiceWith :: { args :: Maybe (Array String), useEntrypoint :: Maybe Boolean } -> Container -> Service
asServiceWith opts container = Service { container, args: opts.args, useEntrypoint: opts.useEntrypoint }

withServiceBinding :: String -> Service -> Container -> Container
withServiceBinding alias service = addOperation (BindService alias service)

withRegistryAuth :: String -> String -> Secret -> Container -> Container
withRegistryAuth registry user password = addOperation (RegistryAuth registry user password)

defaultPublishOpts :: { platformVariants :: Maybe (Array Container) }
defaultPublishOpts = { platformVariants: Nothing }

publishWith :: String -> { platformVariants :: Maybe (Array Container) } -> Container -> Effect String
publishWith address opts container@(Container c) = do
  let variants = [container] <> fromMaybe [] opts.platformVariants
  tags <- Data.Traversable.traverse (\variant -> do
    built <- E.materialize variant
    suffix <- E.fresh c.client "variant-"
    let tag = address <> "-" <> suffix
    void $ E.run (E.docker c.client ["commit", built.id, tag])
    Ref.modify_ (\s -> s { images = s.images <> [tag] }) c.client.state
    void $ E.run (E.docker c.client ["push", tag])
    pure tag) variants
  void $ E.run (E.docker c.client (["manifest", "create", address] <> tags))
  void $ E.run (E.docker c.client ["manifest", "push", address])
  pure address
