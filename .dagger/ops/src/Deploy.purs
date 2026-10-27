module Deploy where

import Prelude
import Data.Argonaut.Decode (decodeJson)
import Data.Argonaut.Parser (jsonParser)
import Data.Array (concatMap, filter, null, nub, reverse, sort)
import Data.Either (Either(..))
import Data.Foldable (all, traverse_)
import Data.Maybe (Maybe(..))
import Data.String.CodeUnits (length, toCharArray)
import Data.String.Common (trim, split, joinWith)
import Data.String.Pattern (Pattern(..))
import Data.Traversable (traverse)
import Effect.Aff (Aff, bracket, catchError, throwError)
import Effect.Exception (error, message)
import Production as Production

type Command = { cwd :: String, args :: Array String, stdin :: Maybe String }
type Binary = { source :: String, destination :: String }
type Transport = { run :: Command -> Aff String, upload :: String -> String -> Aff Unit }

repo :: String
repo = "/root/github/rocksky"

command :: String -> Array String -> Command
command cwd args = { cwd, args, stdin: Nothing }

validate :: String -> String -> Either String (Array Production.Service)
validate commit selection
  | length commit /= 40 || not (all (\c -> c >= '0' && c <= '9' || c >= 'a' && c <= 'f') (toCharArray commit)) = Left "Expected a full commit SHA"
  | otherwise = do
      json <- jsonParser selection
      names <- case decodeJson json of
        Left _ -> Left "Services must be a JSON array of names"
        Right value -> Right (value :: Array String)
      if null names then Left "Select at least one service" else
        traverse (\name -> case Production.lookup name of
          Nothing -> Left ("Unknown production service: " <> name)
          Just service -> Right service) (nub names)

builds :: String -> Array Command
builds name = case name of
  "gleam" ->
    [ command repo [ "cargo", "build", "--locked", "--release", "-p", "rocksky-analysis-node", "--target-dir", repo <> "/target" ]
    , command repo [ "install", "-m", "755", "target/release/librocksky_analysis_node.so", "crates/analysis-node/index.node" ]
    , command repo [ "bun", "install", "--frozen-lockfile" ]
    , command (repo <> "/gleam") [ "gleam", "build", "--target", "javascript" ]
    ]
  "embed" -> [ command (repo <> "/apps/embed") [ "bun", "install", "--frozen-lockfile" ], command (repo <> "/apps/embed") [ "bun", "run", "build:css" ] ]
  "remoteWs" -> map (command (repo <> "/remote-ws")) [ [ "env", "MIX_ENV=prod", "mix", "deps.get" ], [ "env", "MIX_ENV=prod", "mix", "compile" ] ]
  "drift" -> [ command (repo <> "/drift") [ "cargo", "build", "--release", "--locked", "--target-dir", "../.deploy/build-drift" ] ]
  "mb" -> [ command (repo <> "/musicbrainz") [ "go", "build", "-o", repo <> "/.deploy/musicbrainz", "." ] ]
  "deezer" -> goBuild "deezer"
  "discogs" -> goBuild "discogs"
  "spotifyProxy" -> goBuild "spotify"
  _ -> []
  where
  goBuild project = [ command (repo <> "/" <> project) [ "go", "build", "-o", repo <> "/.deploy/" <> project, "main.go" ] ]

-- Match riff/scripts/cargo_static.py without invoking a deployment script.
-- This verifies the official static archive before linking it into Riff.
buildRiff :: Transport -> Aff Unit
buildRiff transport = do
  let run args = transport.run (command repo args)
  arch <- trim <$> run [ "uname", "-m" ]
  release <- case arch of
    "x86_64" -> pure { asset: "linux-amd64", checksum: "deb47c5300f3c99725e84cdb14d214c3b12bbd748b613b1698b938c894cb68eb" }
    "aarch64" -> pure { asset: "linux-arm64", checksum: "ea6a34cb49ec2db5ed23d9e8311237c53c32abf9cdbf5dd608c4176c3dd8bfeb" }
    _ -> throwError (error ("Unsupported production architecture: " <> arch))
  let
    staging = repo <> "/.deploy/riff-duckdb-1.5.5"
    archive = staging <> "/duckdb.zip"
    parts = staging <> "/parts"
    lib = staging <> "/lib"
  void $ run [ "mkdir", "-p", parts, lib ]
  void $ run [ "curl", "--fail", "--location", "--retry", "3", "--connect-timeout", "15", "--max-time", "300", "--output", archive,
    "https://github.com/duckdb/duckdb/releases/download/v1.5.5/static-libs-" <> release.asset <> ".zip" ]
  void $ run [ "grep", "-F", "duckdb = { version = \"=1.10505.0\"", repo <> "/riff/Cargo.toml" ]
  actual <- run [ "sha256sum", archive ]
  when (trim actual /= release.checksum <> "  " <> archive) $
    throwError (error "DuckDB archive checksum mismatch")
  -- Clear extracted files so a previous attempt cannot contribute archive members.
  void $ run [ "rm", "-rf", parts ]
  void $ run [ "unzip", "-o", archive, "-d", parts ]
  traverse_ (\file -> void $ run [ "test", "-s", parts <> "/" <> file ])
    [ "libduckdb_static.a", "libjson_extension.a", "libparquet_extension.a", "duckdb.h" ]
  listing <- run [ "find", parts, "-maxdepth", "1", "-name", "*.a", "-printf", "%f\n" ]
  let
    archives = sort $ filter (_ /= "") $ split (Pattern "\n") listing
    mri = "CREATE ../lib/libduckdb_static.a\n" <> joinWith "" (map (\file -> "ADDLIB " <> file <> "\n") archives) <> "SAVE\nEND\n"
  void $ transport.run ((command parts [ "ar", "-M" ]) { stdin = Just mri })
  void $ run [ "cp", parts <> "/duckdb.h", lib <> "/duckdb.h" ]
  void $ transport.run $ command (repo <> "/riff")
    [ "env", "DUCKDB_LIB_DIR=" <> lib, "DUCKDB_INCLUDE_DIR=" <> lib, "DUCKDB_STATIC=1", "cargo", "build", "--release", "--locked", "--bin", "riff", "--bin", "riff-mb", "--target-dir", "../.deploy/build-riff" ]

binaries :: String -> String -> Array Binary
binaries stage name = case name of
  "rockskyd" -> map (\file -> { source: stage <> "/" <> file, destination: repo <> "/target/release/" <> file }) [ "rockskyd", "rocksky-submissions" ]
  "riff" -> map (\file -> { source: repo <> "/.deploy/build-riff/release/" <> file, destination: repo <> "/riff/target/release/" <> file }) [ "riff", "riff-mb" ]
  "drift" -> [ { source: repo <> "/.deploy/build-drift/release/drift", destination: repo <> "/drift/target/release/drift" } ]
  _ -> []

-- All selection, ordering, recovery and lifecycle decisions execute in PureScript.
-- The transport is injected so the complete flow is testable without SSH/Dagger.
deploy :: Transport -> String -> Array Production.Service -> Aff String
deploy transport commit selected = do
  let
    run args = void $ transport.run (command repo args)
    lock = "/run/lock/rocksky-ci-deploy"
    stage = repo <> "/.deploy/" <> commit
    git args = run ([ "git" ] <> args)
    system action units = run ([ "systemctl", action ] <> units)
  bracket (run [ "mkdir", lock ]) (\_ -> run [ "rmdir", lock ]) \_ -> do
    -- An atomic host lock rejects overlapping deployers; CI also serializes jobs.
    -- A killed runner leaves the lock in place for operator inspection.
    git [ "diff", "--quiet" ]
    git [ "diff", "--cached", "--quiet" ]
    git [ "fetch", "origin", commit ]
    git [ "merge-base", "--is-ancestor", "HEAD", commit ]
    groups <- traverse (\service -> do
      states <- traverse (\unit -> do
        state <- transport.run (command repo [ "systemctl", "show", "--property=ActiveState", "--value", unit ])
        pure { unit, active: trim state == "active" }) service.units
      pure { service, active: map _.unit (filter _.active states) }) selected
    let
      live = filter (not <<< null <<< _.active) groups
      active = nub $ concatMap _.active live
      replacements = concatMap (binaries stage <<< _.name <<< _.service) live
    if null active then pure "No selected production services are active" else do
      git [ "merge", "--ff-only", commit ]
      head <- transport.run (command repo [ "git", "rev-parse", "HEAD" ])
      when (trim head /= commit) $ throwError (error "Production checkout is not the requested commit")
      run [ "mkdir", "-p", stage ]
      traverse_ (\group -> when (group.service.name == "rockskyd") $
        traverse_ (\file -> transport.upload ("/artifacts/" <> file) (stage <> "/" <> file)) [ "rockskyd", "rocksky-submissions" ]) live
      traverse_ (\group ->
        if group.service.name == "riff" then buildRiff transport
        else traverse_ (void <<< transport.run) (builds group.service.name)) live
      -- Back up everything before stopping services or changing executables.
      traverse_ (\binary -> do
        run [ "test", "-s", binary.source ]
        run [ "cp", "-p", binary.destination, binary.destination <> ".ci-previous" ]) replacements
      let
        recover original = do
          outcome <- (do
            system "stop" active
            traverse_ (\binary -> do
              run [ "cp", "-p", binary.destination <> ".ci-previous", binary.destination <> ".ci-rollback" ]
              run [ "mv", "-f", binary.destination <> ".ci-rollback", binary.destination ]) (reverse replacements)
            system "start" active
            pure Nothing) `catchError` (pure <<< Just)
          case outcome of
            Nothing -> throwError original
            Just recovery -> throwError (error (message original <> "; recovery failed: " <> message recovery))
      (do
        system "stop" active
        traverse_ (\binary -> do
          run [ "install", "-m", "755", binary.source, binary.destination <> ".new" ]
          run [ "mv", "-f", binary.destination <> ".new", binary.destination ]) replacements
        system "start" active
        traverse_ (\unit -> run [ "systemctl", "is-active", "--quiet", unit ]) active
        ) `catchError` recover
      pure "Selected active production services deployed"
