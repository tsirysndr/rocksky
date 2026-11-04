module Rocksky.CI.Ops where

import Prelude
import CI.Docker.Types (Client, Directory(..), File, Platform(..), Secret)
import CI.Docker.Engine as Engine
import Rocksky.CI.Operations as Ops
import Rocksky.CI.Desktop as Desktop
import Data.Array (elem)
import Rocksky.CI.ReleaseClients as Release
import Rocksky.CI.Deploy as Deploy
import Rocksky.CI.SSH as SSH
import Data.Either (Either(..))
import CI.Runtime as CI
import CI.Docker.Container as Container
import CI.Docker.Directory as Directory
import CI.Module as Module
import CI.Docker.Query as Query
import Data.Maybe (Maybe(..))
import Effect (Effect)
import CI.Effect (Aff, throwError)
import Effect.Exception (error)
import Data.String (Pattern(..), contains, stripPrefix)

type PostgresArgs =
  { source :: Directory
  , dockerUser :: String
  , dockerPassword :: Secret
  , githubUser :: String
  , githubToken :: Secret
  }

postgresArgs :: Module.Arguments PostgresArgs
postgresArgs = ado
  source <- Module.argument "source"
  dockerUser <- Module.argument "dockerUser"
  dockerPassword <- Module.argument "dockerPassword"
  githubUser <- Module.argument "githubUser"
  githubToken <- Module.argument "githubToken"
  in { source, dockerUser, dockerPassword, githubUser, githubToken }

publishPostgres :: Client -> PostgresArgs -> Aff String
publishPostgres client args = do
  image <- Engine.exportDirectory client args.source
  let auth = Query.container client # Container.from "alpine:3.22"
        # Container.withRegistryAuth "docker.io" args.dockerUser args.dockerPassword
        # Container.withRegistryAuth "ghcr.io" args.githubUser args.githubToken
  void $ Container.sync auth
  void $ Engine.run (Engine.docker client
    [ "buildx", "build", "--platform", "linux/amd64,linux/arm64", "--push"
    , "--tag", "docker.io/tsiry/postgres-xataid:latest"
    , "--tag", "ghcr.io/tsirysndr/postgres-xataid:latest", image ])
  pure "Published PostgreSQL images to Docker Hub and GHCR"

type UploadArgs = { assets :: Directory, tag :: String, token :: Secret, runId :: String }

uploadArgs :: Module.Arguments UploadArgs
uploadArgs = ado
  assets <- Module.argument "assets"
  tag <- Module.argument "tag"
  token <- Module.argument "token"
  runId <- Module.argument "runId"
  in { assets, tag, token, runId }

uploadRelease :: Client -> UploadArgs -> Aff String
uploadRelease = Release.upload

type DesktopArgs = { source :: Directory, version :: String, klipyKey :: Secret }

desktopArgs :: Module.Arguments DesktopArgs
desktopArgs = ado
  source <- Module.argument "source"
  version <- Module.argument "version"
  klipyKey <- Module.argument "klipyKey"
  in { source, version, klipyKey }

desktopRelease :: Client -> DesktopArgs -> Aff Directory
desktopRelease client args = do
  let
    bun = Query.container client # Container.from "oven/bun:1.4.3"
    node = Query.container client # Container.from "node:24-bookworm-slim"
    environment = Query.containerWith
      (Query.defaultContainerOpts { platform = Just (Platform "linux/amd64") }) client
      # Container.from "ubuntu:22.04"
      # Container.withEnvVariable "DEBIAN_FRONTEND" "noninteractive"
      # Container.withEnvVariable "APPIMAGE_EXTRACT_AND_RUN" "1"
      # Ops.apt Desktop.dependencies
      # Container.withExec [ "curl", "--proto", "=https", "--tlsv1.2", "--fail", "--location", "https://static.rust-lang.org/rustup/dist/x86_64-unknown-linux-gnu/rustup-init", "--output", "/tmp/rustup-init" ]
      # Container.withExec [ "chmod", "+x", "/tmp/rustup-init" ]
      # Container.withExec [ "/tmp/rustup-init", "-y", "--profile", "minimal" ]
      # Container.withEnvVariable "PATH" "/root/.cargo/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
      # Container.withFile "/usr/local/bin/bun" (Container.file "/usr/local/bin/bun" bun)
      # Container.withFile "/usr/local/bin/node" (Container.file "/usr/local/bin/node" node)
      # Container.withMountedCache "/root/.cargo/registry" (Query.cacheVolume "rocksky-desktop-cargo-registry" client)
      # Container.withMountedCache "/root/.cargo/git" (Query.cacheVolume "rocksky-desktop-cargo-git" client)
      # Container.withMountedCache "/root/.bun/install/cache" (Query.cacheVolume "rocksky-desktop-bun" client)
      # Container.withMountedCache "/root/.cache/tauri" (Query.cacheVolume "rocksky-desktop-tauri" client)
      # Container.withMountedCache "/src/desktop/src-tauri/target" (Query.cacheVolume "rocksky-desktop-release-amd64" client)
      # Container.withDirectoryWith "/src" args.source
          (Container.defaultWithDirectoryOpts
            { exclude = Just [ ".git", ".dagger", "**/target", "**/node_modules", "**/.env", "**/.env.*" ] })
      -- This tracked public production config is loaded by build:prod.
      # Container.withFile "/src/desktop/.env.prod" (Directory.file "desktop/.env.prod" args.source)
      # Container.withEnvVariable "VERSION" args.version
  built <- Desktop.build args.version args.klipyKey environment
  pure $ Container.directory "/out" built

type DeployArgs =
  { artifacts :: Directory
  , privateKey :: Secret
  , runId :: String
  , commit :: String
  , services :: String
  , host :: String
  , knownHosts :: String
  }

deployArgs :: Module.Arguments DeployArgs
deployArgs = ado
  artifacts <- Module.argument "artifacts"
  privateKey <- Module.argument "privateKey"
  runId <- Module.argument "runId"
  commit <- Module.argument "commit"
  services <- Module.argument "services"
  host <- Module.defaultArgument "host" ""
  knownHosts <- Module.defaultArgument "knownHosts" ""
  in { artifacts, privateKey, runId, commit, services, host, knownHosts }

deploy :: Client -> DeployArgs -> Aff String
deploy client args = case Deploy.validate args.commit args.services of
  Left problem -> throwError (error problem)
  Right selected -> do
    case args.artifacts of
      HostDirectory path -> void $ Engine.run ["mkdir", "-p", path]
      _ -> pure unit
    connection <- case SSH.settings args.host args.knownHosts of
      Left problem -> throwError (error problem)
      Right value -> pure value
    transport <- SSH.connect client args.artifacts args.privateKey args.runId connection.host connection.knownHosts
    Deploy.deploy transport args.commit selected

type NixArgs = { source :: Directory, cachixToken :: Secret, runId :: String }

nixArgs :: Module.Arguments NixArgs
nixArgs = ado
  source <- Module.argument "source"
  cachixToken <- Module.argument "cachixToken"
  runId <- Module.argument "runId"
  in { source, cachixToken, runId }

nixBuild :: Client -> NixArgs -> Aff String
nixBuild client args = do
  let
    image = Query.container client # Container.from "nixos/nix:2.28.5"
    store = Query.cacheVolume "rocksky-nix-store" client
    -- Docker populates an empty named volume from the image's /nix directory.
    -- Mount it directly so the read-only store never passes through the runner.
  Ops.nix args.cachixToken $ image
    # Container.withMountedCache "/nix" store
    # Container.withEnvVariable "NIX_REMOTE" "local"
    # Container.withEnvVariable "NIX_CONFIG" "experimental-features = nix-command flakes\nsandbox = false\nbuild-users-group =\n"
    # Container.withDirectoryWith "/src" args.source
        (Container.defaultWithDirectoryOpts
          { exclude = Just [ ".git", ".dagger", "**/target", "**/node_modules", "**/.env", "**/.env.*", "result-*" ] })
    # Container.withSecretVariable "CACHIX_AUTH_TOKEN" args.cachixToken
    # Container.withEnvVariable "NIX_RUN" args.runId
  pure "Linux Nix builds and configured Cachix uploads completed"

type PackageArgs = { binary :: File, project :: String, tag :: String, target :: String }

packageArgs :: Module.Arguments PackageArgs
packageArgs = ado
  binary <- Module.argument "binary"
  project <- Module.argument "project"
  tag <- Module.argument "tag"
  target <- Module.argument "target"
  in { binary, project, tag, target }

packageRelease :: Client -> PackageArgs -> Aff Directory
packageRelease client args = do
  if args.project /= "playerd" && args.project /= "rocksky-mcp" then
    throwError (error "Unsupported release project")
  else pure unit
  if args.target /= "x86_64-unknown-linux-gnu" && args.target /= "aarch64-unknown-linux-gnu" then
    throwError (error "Expected a Linux release target")
  else pure unit
  version <- case stripPrefix (Pattern (args.project <> "-")) args.tag of
    Just value | value /= "" && not (contains (Pattern "/") value) -> pure value
    _ -> throwError (error "Release tag does not match the project")
  Release.binary client
    { binary: args.binary
    , name: args.project <> "-" <> version <> "-" <> args.target
    , executableName: args.project
    }

type EnsureArgs = { project :: String, tag :: String, commit :: String, token :: Secret, runId :: String }

ensureArgs :: Module.Arguments EnsureArgs
ensureArgs = ado
  project <- Module.argument "project"
  tag <- Module.argument "tag"
  commit <- Module.argument "commit"
  token <- Module.argument "token"
  runId <- Module.argument "runId"
  in { project, tag, commit, token, runId }

ensureRelease :: Client -> EnsureArgs -> Aff String
ensureRelease client args = do
  details <- Ops.releaseDetails args.project args.tag
  Release.ensure client
    { tag: args.tag, commit: args.commit, token: args.token, runId: args.runId
    , title: details.title, notes: details.notes, prerelease: elem "--prerelease" details.extra
    }

definitions :: Array Module.ObjectDefinition
definitions =
  [ Module.object_ "ReleaseOps" {}
      [ Module.function "publishPostgres" "Build both Linux architectures and publish PostgreSQL to Docker Hub and GHCR." postgresArgs publishPostgres
      , Module.function "uploadRelease" "Upload staged release assets to the existing Rocksky release." uploadArgs uploadRelease
      , Module.function "ensureRelease" "Create the tagged Rocksky release if it does not exist." ensureArgs ensureRelease
      , Module.function "packageRelease" "Package a Linux release executable and its checksum." packageArgs packageRelease
      , Module.function "desktopRelease" "Build and verify Ubuntu-compatible Linux desktop bundles." desktopArgs desktopRelease
      , Module.function "deploy" "Deploy selected Rocksky services over SSH." deployArgs deploy
      , Module.function "nixBuild" "Build Linux flake packages and publish closures when Cachix credentials are present." nixArgs nixBuild
      ]
  ]

run :: String -> Effect Unit
run = CI.runModule definitions

publishPostgresJob :: Effect Unit
publishPostgresJob = run "publishPostgres"

uploadReleaseJob :: Effect Unit
uploadReleaseJob = run "uploadRelease"

ensureReleaseJob :: Effect Unit
ensureReleaseJob = run "ensureRelease"

packageReleaseJob :: Effect Unit
packageReleaseJob = run "packageRelease"

desktopReleaseJob :: Effect Unit
desktopReleaseJob = run "desktopRelease"

deployJob :: Effect Unit
deployJob = run "deploy"

nixBuildJob :: Effect Unit
nixBuildJob = run "nixBuild"
