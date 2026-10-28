module Main where

import Prelude
import CI.Runtime as CI
import Dagger (Client)
import Dagger.Container as C
import Dagger.Directory as D
import Dagger.Modules as M
import Dagger.Query as Q
import Dagger.Types (Directory, File)
import Data.Array (null, sort)
import Data.Foldable (all, foldM)
import Data.Maybe (Maybe(..))
import Data.String (Pattern(..), contains)
import Data.String.CodeUnits (toCharArray)
import Effect (Effect)
import Effect.Aff (Aff, throwError)
import Effect.Exception (error)

safeName :: String -> Boolean
safeName name = name /= "" && name /= "." && name /= ".." &&
  all (\c -> c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9' || c == '.' || c == '-' || c == '_') (toCharArray name)

type ArchiveArgs = { source :: Directory, name :: String }
archiveArgs :: M.Arguments ArchiveArgs
archiveArgs = ado
  source <- M.argument "source"
  name <- M.argument "name"
  in { source, name }

archive :: Client -> ArchiveArgs -> Aff Directory
archive client args = do
  unless (safeName args.name) $ throwError (error "name must be a safe archive basename without directories")
  entries <- sort <$> D.entries args.source
  when (null entries) $ throwError (error "Cannot archive an empty directory")
  let asset = args.name <> ".tar.gz"
  let built = Q.container client
        # C.from "node:24-bookworm-slim"
        # C.withDirectory "/input" args.source
        # C.withExec [ "mkdir", "-p", "/out" ]
        -- Normalize metadata and traversal order for reproducible archives.
        # C.withExec ([ "tar", "--sort=name", "--mtime=@0", "--owner=0", "--group=0", "--numeric-owner", "--format=gnu", "-C", "/input", "-czf", "/out/" <> asset, "--" ] <> entries)
  checksums client (C.directory "/out" built)

checksums :: Client -> Directory -> Aff Directory
checksums client assets = do
  files <- D.entries assets
  when (null files) $ throwError (error "No assets supplied")
  -- A flat directory is intentional: reject folders and ambiguous manifest names.
  let base = Q.container client # C.from "node:24-bookworm-slim"
        # C.withDirectory "/assets" assets # C.withWorkdir "/assets"
  built <- foldM (\container file -> do
    unless (safeName file) $ throwError (error "Asset names must be safe basenames")
    when (contains (Pattern ".sha256") file) $ throwError (error "Supply assets without existing checksum sidecars")
    pure $ container
      # C.withExec [ "test", "-f", "./" <> file ]
      # C.withExecWith [ "sha256sum", "--", file ]
          (C.defaultWithExecOpts { redirectStdout = Just (file <> ".sha256") })) base files
  pure $ C.directory "/assets" built

type BinaryArgs = { binary :: File, name :: String, executableName :: String }
binaryArgs :: M.Arguments BinaryArgs
binaryArgs = ado
  binary <- M.argument "binary"
  name <- M.argument "name"
  executableName <- M.argument "executableName"
  in { binary, name, executableName }

binary :: Client -> BinaryArgs -> Aff Directory
binary client args = do
  unless (safeName args.executableName) $ throwError (error "Invalid executable name")
  let source = Q.directory client # D.withFileWith args.executableName args.binary
        (D.defaultWithFileOpts { permissions = Just 493 })
  archive client { source, name: args.name }

main :: Effect Unit
main = CI.runModule
  [ M.object_ "ReleaseArtifacts" {}
      [ M.function "archive" "Create a reproducible tar.gz and SHA-256 sidecar from a directory." archiveArgs archive
      , M.function "checksums" "Add sha256sum-compatible sidecars to a flat assets directory." (M.argument "assets") checksums
      , M.function "binary" "Package any executable with mode 0755 and a SHA-256 sidecar." binaryArgs binary
      ]
  ]
