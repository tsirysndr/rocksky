module Riff (prepare, smoke) where

import Prelude
import Dagger (Client)
import Dagger.Container as C
import Dagger.Service as Service
import Dagger.Query as Query
import Dagger.Types (Container)
import Data.Array (filter, sort)
import Data.Foldable (foldM)
import Data.Maybe (Maybe(..))
import Data.String (Pattern(..), split, trim, joinWith)
import Effect.Aff (Aff, bracket, throwError)
import Effect.Exception (error)

prepare :: Container -> Aff Container
prepare container = do
  arch <- trim <$> C.stdout (container # C.withExec [ "uname", "-m" ])
  release <- case arch of
    "x86_64" -> pure { asset: "linux-amd64", hash: "deb47c5300f3c99725e84cdb14d214c3b12bbd748b613b1698b938c894cb68eb" }
    "aarch64" -> pure { asset: "linux-arm64", hash: "ea6a34cb49ec2db5ed23d9e8311237c53c32abf9cdbf5dd608c4176c3dd8bfeb" }
    _ -> throwError (error "Unsupported DuckDB build architecture")
  let downloaded = container
        # C.withExec [ "grep", "-F", "duckdb = { version = \"=1.10505.0\"", "/src/Cargo.toml" ]
        # C.withExec [ "mkdir", "-p", "/opt/duckdb/lib", "/opt/duckdb/parts" ]
        # C.withExec [ "curl", "--fail", "--location", "--retry", "3", "--connect-timeout", "15", "--max-time", "300", "--output", "/opt/duckdb/archive.zip", "https://github.com/duckdb/duckdb/releases/download/v1.5.5/static-libs-" <> release.asset <> ".zip" ]
        # C.withExecWith [ "sha256sum", "--check", "-" ] (C.defaultWithExecOpts { stdin = Just (release.hash <> "  /opt/duckdb/archive.zip\n") })
        # C.withExec [ "unzip", "-o", "/opt/duckdb/archive.zip", "-d", "/opt/duckdb/parts" ]
        # C.withExec [ "test", "-s", "/opt/duckdb/parts/libduckdb_static.a" ]
        # C.withExec [ "test", "-s", "/opt/duckdb/parts/libjson_extension.a" ]
        # C.withExec [ "test", "-s", "/opt/duckdb/parts/libparquet_extension.a" ]
  listing <- C.stdout (downloaded # C.withExec [ "find", "/opt/duckdb/parts", "-maxdepth", "1", "-name", "*.a", "-printf", "%f\n" ])
  let archives = sort $ filter (_ /= "") $ split (Pattern "\n") listing
  let mri = "CREATE ../lib/libduckdb_static.a\n" <> joinWith "" (map (\file -> "ADDLIB " <> file <> "\n") archives) <> "SAVE\nEND\n"
  pure $ downloaded
    # C.withWorkdir "/opt/duckdb/parts"
    # C.withExecWith [ "ar", "-M" ] (C.defaultWithExecOpts { stdin = Just mri })
    # C.withExec [ "cp", "duckdb.h", "/opt/duckdb/lib/duckdb.h" ]
    # C.withEnvVariable "DUCKDB_LIB_DIR" "/opt/duckdb/lib"
    # C.withEnvVariable "DUCKDB_INCLUDE_DIR" "/opt/duckdb/lib"
    # C.withEnvVariable "DUCKDB_STATIC" "1"
    # C.withWorkdir "/src"

smoke :: Client -> Container -> Aff Unit
smoke client built = do
  let
    fixtures = built
      # C.withExec [ "cargo", "run", "--release", "--bin", "riff-fixtures", "--", "--out", "testdata" ]
      # C.withExec [ "cargo", "build", "--release", "--bin", "riff" ]
      # C.withExec [ "cp", "target/release/riff", "/usr/local/bin/riff" ]
    service = fixtures # C.withExposedPort 8092
      # C.asServiceWith (C.defaultAsServiceOpts { args = Just [ "/usr/local/bin/riff", "--host", "0.0.0.0", "--port", "8092" ], useEntrypoint = Just false })
    probe = Query.container client # C.from "alpine:3.22"
      # C.withExec [ "apk", "add", "--no-cache", "curl", "jq" ]
      # C.withServiceBinding "riff" service
    checks =
      [ { path: "/health", args: [], predicate: ".status == \"ok\"" }
      , { path: "/v1/search", args: [ "-G", "--data-urlencode", "type=track", "--data-urlencode", "q=track:\"Neon Tide\" artist:\"Kova Lune\"" ], predicate: ".tracks.items[0].name == \"Neon Tide\"" }
      , { path: "/v1/albums/riffalb000000000000003", args: [], predicate: ".total_tracks == 6 and (.tracks.items | length) == 6" }
      , { path: "/v1/audio-features/rifftrk000000000000010", args: [], predicate: "(.danceability | type) == \"number\"" }
      ]
  bracket (Service.start service) (\_ -> void $ Service.stop service) \_ -> do
    checked <- foldM (\container check -> pure $ container
      # C.withExecWith ([ "curl", "--fail", "--silent", "--show-error", "--retry", "30", "--retry-connrefused", "--retry-delay", "1", "http://riff:8092" <> check.path ] <> check.args)
          (C.defaultWithExecOpts { redirectStdout = Just "/response.json" })
      # C.withExec [ "jq", "-e", check.predicate, "/response.json" ]) probe checks
    void $ C.sync $ checked # C.withExec [ "curl", "--fail", "--silent", "--show-error", "http://riff:8092/" ]
