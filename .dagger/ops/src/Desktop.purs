module Desktop (build, dependencies) where

import Prelude
import Dagger.Container as C
import Dagger.Secret as Secret
import Dagger.Types (Container, Secret)
import Data.Argonaut.Core (stringify)
import Data.Argonaut.Encode (encodeJson)
import Data.Array (filter, head, last)
import Data.Foldable (all, foldM)
import Data.Maybe (Maybe(..))
import Data.String (Pattern(..), split, trim, contains)
import Data.String.CodeUnits (toCharArray)
import Data.Tuple (Tuple(..))
import Foreign.Object as Object
import Effect.Aff (Aff, throwError)
import Effect.Exception (error)
import Operations as Ops

dependencies :: Array String
dependencies = [ "libwebkit2gtk-4.1-dev", "libayatana-appindicator3-dev", "librsvg2-dev", "libasound2-dev", "libpcsclite-dev", "libxdo-dev", "libssl-dev", "libfribidi0", "libharfbuzz0b", "libgles2", "build-essential", "pkg-config", "patchelf", "rpm", "file", "binutils", "squashfs-tools", "python3", "xvfb", "xauth", "x11-utils", "dbus-x11", "curl", "ca-certificates", "git", "jq" ]

build :: String -> Secret -> Container -> Aff Container
build version klipyKey environment = do
  let
    launcher = "/root/.cache/tauri/AppRun-x86_64"
    base = environment
      # C.withWorkdir "/src"
      # C.withExec [ "bun", "install", "--frozen-lockfile" ]
      # C.withWorkdir "/src/sdk/typescript"
      # C.withExec [ "bun", "run", "build" ]
      # C.withWorkdir "/src/desktop"
      # C.withExecWith [ "jq", "--arg", "v", version, ".version = $v", "src-tauri/tauri.conf.json" ]
          (C.defaultWithExecOpts { redirectStdout = Just "/tmp/tauri.conf.json" })
      # C.withExec [ "mv", "/tmp/tauri.conf.json", "src-tauri/tauri.conf.json" ]
      # C.withExec [ "mkdir", "-p", "/root/.cache/tauri" ]
      # C.withExec [ "curl", "--fail", "--location", "--retry", "3", "https://github.com/tauri-apps/binary-releases/releases/download/apprun-old/AppRun-x86_64", "--output", launcher ]
      # Ops.verify "f30140a43a0a59e46db21bdefdf749b9e9f2c6946e92afabbacf98b8ae73fb4f" launcher
      # C.withExec [ "chmod", "0755", launcher ]
    cache = base # C.withExec [ "ldconfig", "-p" ]
  libraries <- C.stdout cache
  files <- foldM (\result name -> do
    path <- case head $ filter (\line -> contains (Pattern (name <> " ")) line && contains (Pattern "x86-64") line) (split (Pattern "\n") libraries) of
      Just line -> case last (split (Pattern "=>") line) of
        Just value -> pure (trim value)
        _ -> throwError (error ("Invalid library entry: " <> name))
      _ -> throwError (error ("Missing build dependency: " <> name))
    resolved <- C.stdout (cache # C.withExec [ "realpath", "-e", path ])
    pure $ result <> [ Tuple ("/usr/lib/" <> name) (trim resolved) ]) [] [ "libfribidi.so.0", "libharfbuzz.so.0" ]
  key <- Secret.plaintext klipyKey
  let
    configured = cache
      # C.withNewFile "/tmp/rocksky-appimage.json" (stringify $ encodeJson { bundle: { linux: { appimage: { files: Object.fromFoldable files } } } })
      # C.withEnvVariable "LIBGL_ALWAYS_SOFTWARE" "1"
    keyed = if key == "" then configured else C.withSecretVariable "VITE_KLIPY_API_KEY" klipyKey configured
    built = keyed # C.withExec [ "bun", "run", "tauri", "build", "--target", "x86_64-unknown-linux-gnu", "--bundles", "deb,rpm,appimage", "--config", "{\"build\":{\"beforeBuildCommand\":\"bun run build:prod\"}}", "--config", "/tmp/rocksky-appimage.json" ]
    folder = "/src/desktop/src-tauri/target/x86_64-unknown-linux-gnu/release/bundle"
  image <- Ops.singleFile (folder <> "/appimage") ".AppImage" built
  offset <- trim <$> C.stdout (built # C.withExec [ image, "--appimage-offset" ])
  when (offset == "" || not (all (\c -> c >= '0' && c <= '9') (toCharArray offset))) $
    throwError (error "Invalid AppImage SquashFS offset")
  let verified = built
        # C.withExec [ "unsquashfs", "-no-progress", "-o", offset, "-d", "/tmp/rocksky-squashfs", image ]
        # C.withExec [ "python3", "scripts/check-appimage.py", "/tmp/rocksky-squashfs" ]
        # C.withExec [ "dbus-run-session", "--", "xvfb-run", "-a", "python3", "scripts/smoke-appimage.py", "/tmp/rocksky-squashfs/AppRun" ]
        # C.withExec [ "mkdir", "-p", "/out" ]
  foldM (\container bundle -> do
    file <- Ops.singleFile (folder <> "/" <> bundle.folder) bundle.suffix container
    let asset = "Rocksky_" <> version <> "_" <> bundle.arch <> bundle.suffix
    pure $ container # C.withExec [ "cp", file, "/out/" <> asset ]
      # C.withWorkdir "/out" # Ops.checksum asset) verified
    [ { folder: "deb", suffix: ".deb", arch: "amd64" }, { folder: "rpm", suffix: ".rpm", arch: "x86_64" }, { folder: "appimage", suffix: ".AppImage", arch: "amd64" } ]
