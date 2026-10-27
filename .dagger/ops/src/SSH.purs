module SSH (connect, defaultHost, defaultKnownHosts, settings) where

import Prelude
import Dagger (Client)
import Dagger.Container as Container
import Dagger.Query as Query
import Dagger.Types (Directory, Secret)
import Data.Maybe (Maybe(..))
import Data.Either (Either(..))
import Data.Foldable (all)
import Data.String.CodeUnits (toCharArray)
import Data.Array as Array
import Data.String (contains, Pattern(..), Replacement(..), joinWith, replaceAll)
import Deploy (Transport)
import Effect.Aff (Aff)
import Effect.Class (liftEffect)
import Effect.Ref as Ref

defaultAddress :: String
defaultAddress = "161.97.141.205"

defaultHost :: String
defaultHost = "root@" <> defaultAddress

defaultKnownHosts :: String
defaultKnownHosts = defaultAddress <> " ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIJVX20bYnY4FZKN2x64PTvmV4Vx3FqSJyEYsiYT4WsQx\n"

settings :: String -> String -> Either String { host :: String, knownHosts :: String }
settings inputHost inputKeys = do
  let host = if inputHost == "" then defaultHost else inputHost
  unless (all (\c -> c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9' || c == '.' || c == '-' || c == '_' || c == '@') (toCharArray host)) $
    Left "SSH host must be a hostname or user@hostname (without spaces or options)"
  when (host == "" || contains (Pattern "--") host || case toCharArray host of
    [] -> true
    chars -> case Array.head chars of
      Just '-' -> true
      _ -> false) $ Left "Invalid SSH host"
  when (host /= defaultHost && inputKeys == "") $ Left "A host override requires --known-hosts (ROCKSKY_DEPLOY_KNOWN_HOSTS in CI)"
  pure { host, knownHosts: if inputKeys == "" then defaultKnownHosts else inputKeys }

quote :: String -> String
quote value = "'" <> replaceAll (Pattern "'") (Replacement "'\"'\"'") value <> "'"

-- SSH's protocol carries a command string. Quoting is transport encoding only:
-- no remote loops, conditionals, traps, or generated deployment scripts.
connect :: Client -> Directory -> Secret -> String -> String -> String -> Aff Transport
connect client artifacts privateKey runId host knownHosts = do
  let
    options = [ "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", "-o", "ConnectTimeout=15", "-o", "ServerAliveInterval=30", "-o", "ServerAliveCountMax=3" ]
    environment = Query.container client
      # Container.from "node:24-bookworm-slim"
      # Container.withExec [ "apt-get", "update" ]
      # Container.withExec [ "apt-get", "install", "-y", "--no-install-recommends", "openssh-client", "ca-certificates" ]
      # Container.withDirectory "/artifacts" artifacts
      # Container.withExec [ "mkdir", "-p", "/root/.ssh" ]
      # Container.withExec [ "chmod", "700", "/root/.ssh" ]
      # Container.withMountedSecret "/run/secrets/ssh-key-base64" privateKey
      # Container.withExecWith [ "base64", "--decode", "/run/secrets/ssh-key-base64" ]
          (Container.defaultWithExecOpts { redirectStdout = Just "/root/.ssh/id_ed25519" })
      # Container.withExec [ "chmod", "600", "/root/.ssh/id_ed25519" ]
      -- Verified against the existing known_hosts entry during the host audit.
      # Container.withNewFile "/root/.ssh/known_hosts" knownHosts
      # Container.withEnvVariable "DEPLOY_RUN" runId
  counter <- liftEffect $ Ref.new 0
  let
    execute stdin args = do
      step <- liftEffect $ Ref.modify (_ + 1) counter
      -- Each side effect (including recovery) must run, even if argv repeats.
      Container.stdout $ environment
        # Container.withEnvVariable "DEPLOY_STEP" (show step)
        # Container.withExecWith args (Container.defaultWithExecOpts { stdin = stdin })
    run cmd = execute cmd.stdin ([ "ssh" ] <> options <> [ host,
      joinWith " " $ map quote [ "/bin/bash", "-ic",
        "exec " <> joinWith " " (map quote ([ "env", "--chdir=" <> cmd.cwd ] <> cmd.args)) ] ])
    upload source destination = void $ execute Nothing ([ "scp" ] <> options <> [ source, host <> ":" <> destination ])
  pure { run, upload }
