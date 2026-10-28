module Main where

import Prelude
import Operations as Ops
import Desktop as Desktop
import Data.Array (null)
import Deploy as Deploy
import SSH as SSH
import Data.Either (Either(..))
import CI.Runtime as CI
import Dagger (Client)
import Dagger.Container as Container
import Dagger.Directory as Directory
import Dagger.Modules as Module
import Dagger.Query as Query
import Dagger.Types (Directory, File, Platform(..), Secret, ReturnType(..))
import Data.Maybe (Maybe(..))
import Effect (Effect)
import Effect.Aff (Aff, throwError)
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
publishPostgres _ args = do
  let
    build platform = args.source
      # Directory.dockerBuildWith (Directory.defaultDockerBuildOpts { platform = Just (Platform platform) })
      # Container.withRegistryAuth "docker.io" args.dockerUser args.dockerPassword
      # Container.withRegistryAuth "ghcr.io" args.githubUser args.githubToken
    amd64 = build "linux/amd64"
    arm64 = build "linux/arm64"
    options = Container.defaultPublishOpts { platformVariants = Just [ arm64 ] }
  docker <- Container.publishWith "docker.io/tsiry/postgres-xataid:latest" options amd64
  github <- Container.publishWith "ghcr.io/tsirysndr/postgres-xataid:latest" options amd64
  pure (docker <> "\n" <> github)

type UploadArgs = { assets :: Directory, tag :: String, token :: Secret, runId :: String }

uploadArgs :: Module.Arguments UploadArgs
uploadArgs = ado
  assets <- Module.argument "assets"
  tag <- Module.argument "tag"
  token <- Module.argument "token"
  runId <- Module.argument "runId"
  in { assets, tag, token, runId }

uploadRelease :: Client -> UploadArgs -> Aff String
uploadRelease client args = do
  files <- Directory.entries args.assets
  when (null files) $ throwError (error "No release assets supplied")
  void $ Container.sync $ Query.container client
    # Container.from "node:24-bookworm-slim"
    # Ops.apt [ "gh", "ca-certificates" ]
    # Container.withDirectory "/assets" args.assets
    # Container.withWorkdir "/assets"
    # Container.withSecretVariable "GH_TOKEN" args.token
    # Container.withEnvVariable "GH_REPO" "tsirysndr/rocksky"
    # Container.withEnvVariable "WORKFLOW_RUN" args.runId
    # Container.withExec ([ "gh", "release", "upload", args.tag, "--clobber", "--" ] <> files)
  pure "Release assets uploaded"

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
    -- Seed a fresh cache before mounting it over the image's own Nix binaries.
    seed = Query.container client
      # Container.from "node:24-bookworm-slim"
      # Container.withDirectory "/seed" (Container.directory "/nix" image)
      # Container.withMountedCache "/nix" store
      # Container.withEnvVariable "NIX_RUN" args.runId
      # Container.withExec [ "cp", "-an", "/seed/.", "/nix/" ]
  void $ Container.sync seed
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
  let
    asset = args.project <> "-" <> version <> "-" <> args.target <> ".tar.gz"
    environment = Query.container client
      # Container.from "node:24-bookworm-slim"
      # Container.withFileWith ("/work/" <> args.project) args.binary
          (Container.defaultWithFileOpts { permissions = Just 493 })
      # Container.withExec [ "mkdir", "-p", "/out" ]
      # Container.withExec [ "tar", "-C", "/work", "-czf", "/out/" <> asset, args.project ]
      # Container.withWorkdir "/out"
      # Container.withEnvVariable "ASSET" asset
      # Ops.checksum asset
  pure $ Container.directory "/out" environment

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
  let environment = Query.container client
        # Container.from "node:24-bookworm-slim"
        # Ops.apt [ "gh", "ca-certificates" ]
        # Container.withWorkdir "/work"
        # Container.withSecretVariable "GH_TOKEN" args.token
        # Container.withEnvVariable "GH_REPO" "tsirysndr/rocksky"
        # Container.withEnvVariable "WORKFLOW_RUN" args.runId
  status <- Container.exitCode $ environment
    # Container.withExecWith [ "gh", "release", "view", args.tag ]
        (Container.defaultWithExecOpts { expect = Just ReturnTypeAny })
  when (status /= 0) $ void $ Container.sync $ environment
    # Container.withExec ([ "gh", "release", "create", args.tag, "--title", details.title, "--notes", details.notes, "--target", args.commit ] <> details.extra)
  pure "Release is ready"

main :: Effect Unit
main = CI.runModule
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
