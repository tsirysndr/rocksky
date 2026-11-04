-- All orchestration runs through the FluentCI guest PDK. Docker supplies the
-- same isolated Linux toolchains and service topology as the former jobs.
module CI.Docker.Engine where

import Prelude
import CI.Docker.Types
import Data.Argonaut.Core (stringify)
import Data.Argonaut.Parser (jsonParser)
import Data.Argonaut.Decode (decodeJson, printJsonDecodeError)
import Data.Argonaut.Encode (encodeJson)
import Data.Array as Data.Array
import Data.Array (null)
import Data.Either (Either(..))
import Data.Foldable (foldM, traverse_)
import Data.Traversable (traverse)
import Data.Maybe (Maybe(..), fromMaybe)
import Data.String as Data.String
import Data.String (Pattern(..), Replacement(..), joinWith, replaceAll, split, trim)
import Data.Tuple (Tuple(..))
import Effect (Effect)
import Effect.Exception (throw, try)
import Effect.Ref as Ref
import FluentCI.Plugin as P
import Foreign.Object (Object)
import Foreign.Object as Object

unwrap :: forall a. Effect (P.Result a) -> Effect a
unwrap action = action >>= case _ of
  Left failure -> throw (P.errorMessage failure)
  Right value -> pure value

quote :: String -> String
quote value = "'" <> replaceAll (Pattern "'") (Replacement "'\"'\"'") value <> "'"

command :: Array String -> String
command = joinWith " " <<< map quote

-- Host-call failures may trap the Wasm guest before PureScript can recover.
-- Keep the host call successful and decode the process exit status in the guest.
-- JSON also preserves exact stdout across engines that normalize log lines.
capture :: Object Secret -> Array String -> Effect String
capture secrets args = do
  let script = "const {spawnSync}=require('node:child_process');const args=JSON.parse(process.argv[1]);const r=spawnSync(args[0],args.slice(1),{encoding:'utf8',stdio:['inherit','pipe','inherit'],maxBuffer:64*1024*1024});if(r.error)console.error(r.error.message);process.stdout.write(JSON.stringify({code:r.status??127,output:r.stdout??''}));"
  let pipeline = Object.fold (\p key (Secret secret) -> P.withSecret key (P.secret secret.name secret.value) p) (P.pipeline "rocksky-ci") secrets
  raw <- unwrap $ P.stdout $ pipeline # P.exec ["node", "-e", script, stringify (encodeJson args)]
  value <- case jsonParser raw of
    Left problem -> throw ("Invalid process response: " <> problem)
    Right json -> case decodeJson json of
      Left problem -> throw (printJsonDecodeError problem)
      Right result -> pure (result :: { code :: Int, output :: String })
  if value.code == 0 then pure value.output else throw ("CI command failed with exit status " <> show value.code)

run :: Array String -> Effect String
run = capture Object.empty

shell :: String -> Effect String
shell script = capture Object.empty ["/bin/sh", "-c", script]

secretShell :: Object Secret -> String -> Effect String
secretShell secrets script = capture secrets ["/bin/sh", "-c", script]

absolute :: Client -> String -> String
absolute client path = if path == "" then client.root else
  if fromMaybe "" (Data.Array.head (split (Pattern "/") path)) == "" then path else client.root <> "/" <> path

fresh :: Client -> String -> Effect String
fresh client prefix = do
  state <- Ref.modify (\s -> s { counter = s.counter + 1 }) client.state
  pure (prefix <> show state.counter)

configKey :: Container -> String
configKey (Container c) = stringify $ encodeJson
  { image: c.image, platform: map (\(Platform p) -> p) c.platform
  , mounts: map (\(Tuple p (CacheVolume k)) -> Tuple p k) (Object.toUnfoldable c.mounts :: Array (Tuple String CacheVolume)) }

fileKey :: File -> String
fileKey = case _ of
  HostFile p -> "host:" <> p
  ContainerFile c p -> containerKey c <> ":file:" <> p
  DirectoryFile d p -> directoryKey d <> ":file:" <> p

directoryKey :: Directory -> String
directoryKey = case _ of
  HostDirectory p -> "host:" <> p
  ContainerDirectory c p -> containerKey c <> ":dir:" <> p
  NewDirectory files -> joinWith ";" (map (\f -> f.path <> fileKey f.file <> show f.permissions) files)

operationKey :: Operation -> String
operationKey = case _ of
  Execute e -> stringify $ encodeJson { args: e.args, cwd: e.cwd, env: e.env, secrets: Object.keys e.secrets, stdin: e.stdin, redirect: e.redirectStdout, anyExit: e.anyExit }
  CopyDirectory p d opts -> "dir:" <> p <> directoryKey d <> stringify (encodeJson opts)
  CopyFile p f mode -> "file:" <> p <> fileKey f <> show mode
  WriteFile p text -> "write:" <> p <> text
  BindService alias service -> "service:" <> alias <> serviceKey service
  RegistryAuth registry user (Secret s) -> "auth:" <> registry <> user <> s.name

containerKey :: Container -> String
containerKey container@(Container c) = configKey container <> joinWith "\n" (map operationKey c.operations)

docker :: Client -> Array String -> Array String
docker client args = [ "docker", "--config", client.temporary <> "/docker-config" ] <> args

newContainer :: Container -> String -> Effect String
newContainer (Container c) image = do
  let mountArgs = Object.fold (\args path (CacheVolume name) -> args <> [ "--mount", "type=volume,source=" <> name <> ",target=" <> path ]) [] c.mounts
  let platform = case c.platform of
        Nothing -> []
        Just (Platform name) -> [ "--platform", name ]
  id <- trim <$> run (docker c.client ([ "run", "-d", "--network", c.client.network ] <> platform <> mountArgs <> [ "--entrypoint", "/bin/sh", image, "-c", "while :; do sleep 3600; done" ]))
  Ref.modify_ (\s -> s { resources = s.resources <> [id] }) c.client.state
  pure id

-- Memoize executed prefixes. If a previously executed value branches, snapshot
-- its filesystem before extending it so immutable pipeline values stay isolated.
materialize :: Container -> Effect { id :: String, output :: String }
materialize container@(Container c) = do
  let base = configKey container
  let step state op = do
        let key = state.key <> "\n" <> operationKey op
        cache <- Ref.read c.client.state
        case Object.lookup key cache.containers of
          Just id -> pure { id, key, output: fromMaybe "" (Object.lookup key cache.outputs) }
          Nothing -> do
            id <- if Object.lookup state.id cache.heads == Just state.key then pure state.id else do
              case Object.lookup state.key cache.snapshots of
                Just image -> newContainer container image
                Nothing -> newContainer container c.image
            output <- perform c.client id op
            snapshot <- trim <$> run (docker c.client ["commit", id])
            Ref.modify_ (\s -> s
              { containers = Object.insert key id s.containers
              , snapshots = Object.insert key snapshot s.snapshots
              , images = s.images <> [snapshot]
              , heads = Object.insert id key s.heads
              , outputs = Object.insert key output s.outputs
              }) c.client.state
            pure { id, key, output }
  cache <- Ref.read c.client.state
  id <- case Object.lookup base cache.containers of
    Just value -> pure value
    Nothing -> do
      value <- newContainer container c.image
      Ref.modify_ (\s -> s { containers = Object.insert base value s.containers, heads = Object.insert value base s.heads }) c.client.state
      pure value
  result <- foldM step { id, key: base, output: "" } c.operations
  terminal <- Ref.read c.client.state
  if Object.lookup result.id terminal.heads == Just result.key then
    pure { id: result.id, output: result.output }
  else do
    restored <- newContainer container (fromMaybe c.image (Object.lookup result.key terminal.snapshots))
    Ref.modify_ (\st -> st { containers = Object.insert result.key restored st.containers, heads = Object.insert restored result.key st.heads }) c.client.state
    pure { id: restored, output: result.output }

perform :: Client -> String -> Operation -> Effect String
perform client id = case _ of
  Execute e -> do
    resolved <- traverse (resolveEnv client id) e.env
    let envArgs = Object.fold (\args k v -> args <> [ "--env", k <> "=" <> v ]) [] resolved
    let secretArgs = Object.fold (\args k _ -> args <> [ "--env", k ]) [] e.secrets
    let argv = docker client ([ "exec" ] <> (if e.stdin == Nothing then [] else [ "-i" ]) <> [ "--workdir", e.cwd ] <> envArgs <> secretArgs <> [id] <> e.args)
    -- stdin and redirects are shell transport encoding; argv stays literal.
    let input = case e.stdin of
          Nothing -> ""
          Just value -> "printf '%s' " <> quote value <> " | "
    let redirect = case e.redirectStdout of
          Nothing -> ""
          Just path -> " > " <> quote (client.temporary <> "/redirect")
    -- Redirects target the container filesystem, not the runner.
    if e.redirectStdout /= Nothing then do
      output <- secretShell e.secrets (input <> command argv <> redirect <> if e.anyExit then " || true" else "")
      traverse_ (\path -> void $ run (docker client [ "cp", client.temporary <> "/redirect", id <> ":" <> if takeAbsolute path then path else e.cwd <> "/" <> path ])) e.redirectStdout
      pure output
    else secretShell e.secrets (input <> command argv <> if e.anyExit then " || true" else "")
  CopyDirectory destination source opts -> do
    path <- exportDirectory client source
    stage <- trim <$> run [ "mktemp", "-d", client.temporary <> "/copy.XXXXXX" ]
    let exclusions = map ("--exclude=" <> _) ([".fluentci"] <> fromMaybe [] opts.exclude)
    let inclusions = case opts.include of
          Nothing -> []
          Just patterns -> [ "--include=*/" ] <> map ("--include=" <> _) patterns <> [ "--exclude=*" ]
    void $ run ([ "rsync", "-a", "--prune-empty-dirs" ] <> exclusions <> inclusions <> [ "--", path <> "/", stage <> "/" ])
    void $ run (docker client [ "exec", id, "mkdir", "-p", destination ])
    void $ run (docker client [ "cp", stage <> "/.", id <> ":" <> destination ])
    pure ""
  CopyFile destination source mode -> do
    path <- exportFile client source
    void $ run (docker client [ "exec", id, "sh", "-c", "mkdir -p -- \"$(dirname -- \"$1\")\"", "sh", destination ])
    void $ run (docker client [ "cp", path, id <> ":" <> destination ])
    traverse_ (\permissions -> void $ run (docker client [ "exec", id, "chmod", if permissions == 493 then "0755" else show permissions, destination ])) mode
    pure ""
  WriteFile destination text -> do
    path <- fresh client (client.temporary <> "/file-")
    void $ shell ("printf '%s' " <> quote text <> " > " <> quote path)
    perform client id (CopyFile destination (HostFile path) Nothing)
  BindService alias service -> do
    serviceId <- startServiceAs client alias service
    let Service serviceConfig = service
    let Container source = serviceConfig.container
    if source.image == "redis:7-alpine" then
      void $ run (docker client ["exec", serviceId, "sh", "-c", "i=0; until redis-cli ping; do i=$((i+1)); test $i -lt 60 || exit 1; sleep 1; done"])
    else if source.image == "postgres:16-alpine" then
      void $ run (docker client ["exec", serviceId, "sh", "-c", "i=0; until pg_isready -h 127.0.0.1 -U postgres; do i=$((i+1)); test $i -lt 60 || exit 1; sleep 1; done"])
    else
      void $ run (docker client ["exec", id, "curl", "--fail", "--silent", "--show-error", "--retry", "60", "--retry-connrefused", "--retry-delay", "1", "http://" <> alias <> ":8092/health"])
    pure ""
  RegistryAuth registry user (Secret secret) -> do
    void $ secretShell (Object.singleton "CI_REGISTRY_PASSWORD" (Secret secret))
      ("printf '%s' \"$CI_REGISTRY_PASSWORD\" | " <> command (docker client [ "login", registry, "--username", user, "--password-stdin" ]))
    pure ""
  where
  takeAbsolute path = Data.Array.head (split (Pattern "/") path) == Just ""

exportDirectory :: Client -> Directory -> Effect String
exportDirectory client = case _ of
  HostDirectory path -> pure (absolute client path)
  ContainerDirectory container path -> do
    built <- materialize container
    folder <- trim <$> run [ "mktemp", "-d", client.temporary <> "/directory.XXXXXX" ]
    void $ run (docker client [ "cp", built.id <> ":" <> path <> "/.", folder ])
    pure folder
  NewDirectory files -> do
    folder <- trim <$> run [ "mktemp", "-d", client.temporary <> "/directory.XXXXXX" ]
    traverse_ (\f -> do
      path <- exportFile client f.file
      void $ run [ "cp", path, folder <> "/" <> f.path ]
      traverse_ (\_ -> void $ run [ "chmod", "0755", folder <> "/" <> f.path ]) f.permissions) files
    pure folder

exportFile :: Client -> File -> Effect String
exportFile client = case _ of
  HostFile path -> pure (absolute client path)
  DirectoryFile directory path -> (_ <> "/" <> path) <$> exportDirectory client directory
  ContainerFile container path -> do
    built <- materialize container
    destination <- fresh client (client.temporary <> "/artifact-")
    void $ run (docker client [ "cp", built.id <> ":" <> path, destination ])
    pure destination

startService :: Client -> Service -> Effect String
startService client = startServiceAs client "riff"

startServiceAs :: Client -> String -> Service -> Effect String
startServiceAs client alias service@(Service s) = do
  let key = serviceKey service
  cache <- Ref.read client.state
  case Object.lookup key cache.services of
    Just id -> pure id
    Nothing -> do
      let Container c = s.container
      image <- if null c.operations then pure c.image else do
        built <- materialize s.container
        value <- trim <$> run (docker client [ "commit", built.id ])
        Ref.modify_ (\st -> st { images = st.images <> [value] }) client.state
        pure value
      let env = Object.fold (\args k v -> args <> [ "--env", k <> "=" <> v ]) [] c.env
      -- Assign the service alias at creation, before its process starts.
      let entrypoint = if s.useEntrypoint == Just false then [ "--entrypoint", "" ] else []
      let workdir = if c.cwd == "/" then [] else ["--workdir", c.cwd]
      id <- trim <$> run (docker client ([ "run", "-d", "--network", client.network, "--network-alias", alias ] <> workdir <> env <> entrypoint <> [image] <> fromMaybe [] s.args))
      Ref.modify_ (\st -> st { resources = st.resources <> [id], services = Object.insert key id st.services }) client.state
      pure id

stopService :: Client -> Service -> Effect Unit
stopService client service = do
  cache <- Ref.read client.state
  traverse_ (\id -> void $ run (docker client [ "stop", id ])) (Object.lookup (serviceKey service) cache.services)

createClient :: Effect Client
createClient = do
  temporary <- trim <$> run [ "mktemp", "-d", "-t", "rocksky-fluentci.XXXXXXXX" ]
  root <- trim <$> run [ "pwd", "-P" ]
  state <- Ref.new { containers: Object.empty, snapshots: Object.empty, heads: Object.empty, outputs: Object.empty, resources: [], images: [], services: Object.empty, counter: 0 }
  let network = "rocksky-ci-" <> joinWith "" (split (Pattern "/") temporary)
  void $ run [ "docker", "network", "create", network ]
  pure { state, network, temporary, root }

cleanup :: Client -> Effect Unit
cleanup client = do
  state <- Ref.read client.state
  -- Cleanup is best effort and must not hide the original job failure.
  traverse_ (\id -> void $ try $ run (docker client [ "rm", "--force", "--volumes", id ])) state.resources
  traverse_ (\id -> void $ try $ run (docker client [ "image", "rm", "--force", id ])) state.images
  void $ try $ run (docker client [ "network", "rm", client.network ])
  void $ try $ run [ "rm", "-rf", "--", client.temporary ]

-- Expand against the image environment, retaining the JDK path in Android images.
resolveEnv :: Client -> String -> String -> Effect String
resolveEnv client id value = if Data.String.contains (Pattern "$PATH") value then do
  path <- trim <$> run (docker client ["exec", id, "printenv", "PATH"])
  pure (replaceAll (Pattern "$PATH") (Replacement path) value)
  else pure value

serviceKey :: Service -> String
serviceKey (Service s) = let Container c = s.container in
  containerKey s.container <> stringify (encodeJson c.env) <> show s.args

-- Preserve nonsecret toolchain configuration when returning reusable images.
commitExport :: Client -> String -> Container -> String -> Effect Unit
commitExport client id (Container c) name = do
  resolved <- traverse (resolveEnv client id) c.env
  let changes = Object.fold (\args key value -> args <> ["--change", "ENV " <> key <> "=" <> stringify (encodeJson value)]) [] resolved
  void $ run (docker client (["commit"] <> changes <> ["--change", "WORKDIR " <> c.cwd, id, name]))
