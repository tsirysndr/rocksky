module Main where

import Prelude
import CI.Runtime as CI
import CI.Cache as Cache
import Dagger (Client)
import Dagger.Container as Container
import Dagger.Directory as Directory
import Dagger.Modules as Module
import Dagger.Query as Query
import Dagger.Types (Directory, File, Platform(..), Secret)
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
  void $ Container.sync $ Query.container client
    # Container.from "node:22-bookworm-slim"
    # Container.withExec [ "sh", "-c", "apt-get update && apt-get install -y --no-install-recommends gh ca-certificates && rm -rf /var/lib/apt/lists/*" ]
    # Container.withDirectory "/assets" args.assets
    # Container.withWorkdir "/assets"
    # Container.withSecretVariable "GH_TOKEN" args.token
    # Container.withEnvVariable "GH_REPO" "tsirysndr/rocksky"
    # Container.withEnvVariable "RELEASE_TAG" args.tag
    -- Side effects must execute again on a workflow retry.
    # Container.withEnvVariable "WORKFLOW_RUN" args.runId
    # Container.withExec [ "sh", "-c", "gh release upload \"$RELEASE_TAG\" ./* --clobber" ]
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
    bun = Query.container client # Container.from "oven/bun:1.2.15"
    node = Query.container client # Container.from "node:22-bookworm-slim"
    environment = Query.containerWith
      (Query.defaultContainerOpts { platform = Just (Platform "linux/amd64") }) client
      # Container.from "ubuntu:22.04"
      # Container.withEnvVariable "DEBIAN_FRONTEND" "noninteractive"
      # Container.withEnvVariable "APPIMAGE_EXTRACT_AND_RUN" "1"
      # Container.withDirectory "/pipeline" (Directory.directory ".dagger/ops/scripts" args.source)
      # Container.withExec [ "bash", "/pipeline/desktop-deps.sh" ]
      # Container.withExec [ "sh", "-c", "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal" ]
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
      # Container.withSecretVariable "KLIPY_API_KEY" args.klipyKey
      # Container.withExec [ "bash", "/pipeline/desktop-build.sh" ]
  pure $ Container.directory "/out" environment

type DeployArgs =
  { scripts :: Directory
  , artifacts :: Directory
  , privateKey :: Secret
  , publicKey :: Secret
  , runId :: String
  , api :: String
  , rockskyd :: String
  , embed :: String
  , feeds :: String
  , ws :: String
  , mb :: String
  }

deployArgs :: Module.Arguments DeployArgs
deployArgs = ado
  scripts <- Module.argument "scripts"
  artifacts <- Module.argument "artifacts"
  privateKey <- Module.argument "privateKey"
  publicKey <- Module.argument "publicKey"
  runId <- Module.argument "runId"
  api <- Module.argument "api"
  rockskyd <- Module.argument "rockskyd"
  embed <- Module.argument "embed"
  feeds <- Module.argument "feeds"
  ws <- Module.argument "ws"
  mb <- Module.argument "mb"
  in { scripts, artifacts, privateKey, publicKey, runId, api, rockskyd, embed, feeds, ws, mb }

deploy :: Client -> DeployArgs -> Aff String
deploy client args = do
  void $ Container.sync $ Query.container client
    # Container.from "node:22-bookworm-slim"
    # Container.withExec [ "sh", "-c", "apt-get update && apt-get install -y --no-install-recommends openssh-client ca-certificates && rm -rf /var/lib/apt/lists/*" ]
    # Container.withDirectory "/pipeline" args.scripts
    # Container.withDirectory "/src/target/release" args.artifacts
    # Container.withSecretVariable "SSH_PRIVATE_KEY" args.privateKey
    # Container.withSecretVariable "SSH_PUBLIC_KEY" args.publicKey
    # Container.withEnvVariable "DEPLOY_RUN" args.runId
    # Container.withEnvVariable "DEPLOY_API" args.api
    # Container.withEnvVariable "DEPLOY_ROCKSKYD" args.rockskyd
    # Container.withEnvVariable "DEPLOY_EMBED" args.embed
    # Container.withEnvVariable "DEPLOY_FEEDS" args.feeds
    # Container.withEnvVariable "DEPLOY_WS" args.ws
    # Container.withEnvVariable "DEPLOY_MB" args.mb
    # Container.withExec [ "bash", "/pipeline/deploy.sh" ]
  pure "Selected services deployed"

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
      # Container.from "node:22-bookworm-slim"
      # Container.withDirectory "/seed" (Container.directory "/nix" image)
      # Container.withMountedCache "/nix" store
      # Container.withEnvVariable "NIX_RUN" args.runId
      # Container.withExec [ "cp", "-an", "/seed/.", "/nix/" ]
  void $ Container.sync seed
  void $ Container.sync $ image
    # Container.withMountedCache "/nix" store
    # Container.withEnvVariable "NIX_REMOTE" "local"
    # Container.withEnvVariable "NIX_CONFIG" "experimental-features = nix-command flakes\nsandbox = false\nbuild-users-group =\n"
    # Container.withDirectory "/pipeline" (Directory.directory ".dagger/ops/scripts" args.source)
    # Container.withDirectoryWith "/src" args.source
        (Container.defaultWithDirectoryOpts
          { exclude = Just [ ".git", ".dagger", "**/target", "**/node_modules", "**/.env", "**/.env.*", "result-*" ] })
    # Container.withSecretVariable "CACHIX_AUTH_TOKEN" args.cachixToken
    # Container.withEnvVariable "NIX_RUN" args.runId
    # Container.withExec [ "sh", "/pipeline/nix-build.sh" ]
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
      # Container.from "node:22-bookworm-slim"
      # Container.withFileWith ("/work/" <> args.project) args.binary
          (Container.defaultWithFileOpts { permissions = Just 493 })
      # Container.withExec [ "mkdir", "-p", "/out" ]
      # Container.withExec [ "tar", "-C", "/work", "-czf", "/out/" <> asset, args.project ]
      # Container.withWorkdir "/out"
      # Container.withEnvVariable "ASSET" asset
      # Container.withExec [ "sh", "-c", "sha256sum \"$ASSET\" > \"$ASSET.sha256\"" ]
  pure $ Container.directory "/out" environment

type EnsureArgs = { scripts :: Directory, project :: String, tag :: String, commit :: String, token :: Secret, runId :: String }

ensureArgs :: Module.Arguments EnsureArgs
ensureArgs = ado
  scripts <- Module.argument "scripts"
  project <- Module.argument "project"
  tag <- Module.argument "tag"
  commit <- Module.argument "commit"
  token <- Module.argument "token"
  runId <- Module.argument "runId"
  in { scripts, project, tag, commit, token, runId }

ensureRelease :: Client -> EnsureArgs -> Aff String
ensureRelease client args = do
  script <- case args.project of
    "playerd" -> pure "prepare-playerd.sh"
    "rocksky-mcp" -> pure "prepare-rocksky-mcp.sh"
    "bindings" -> pure "prepare-bindings.sh"
    "desktop" -> pure "prepare-desktop.sh"
    _ -> throwError (error "Unsupported release project")
  void $ Container.sync $ Query.container client
    # Container.from "node:22-bookworm-slim"
    # Container.withExec [ "sh", "-c", "apt-get update && apt-get install -y --no-install-recommends gh ca-certificates && rm -rf /var/lib/apt/lists/*" ]
    # Container.withDirectory "/pipeline" args.scripts
    # Container.withWorkdir "/work"
    # Container.withSecretVariable "GH_TOKEN" args.token
    # Container.withEnvVariable "GH_REPO" "tsirysndr/rocksky"
    # Container.withEnvVariable "GITHUB_SHA" args.commit
    # Container.withEnvVariable "RELEASE_TAG" args.tag
    # Container.withEnvVariable "WORKFLOW_RUN" args.runId
    # Container.withExec [ "bash", "/pipeline/" <> script ]
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
      , Module.function "saveCaches" "Snapshot named cache volumes for GitHub Actions cache." Cache.cacheArgs Cache.saveCaches
      , Module.function "restoreCaches" "Restore named cache volumes before a build." Cache.restoreArgs Cache.restoreCaches
      ]
  ]
