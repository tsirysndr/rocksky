module Host.Release where

import Prelude
import Data.Array (filter, head, index, null)
import Data.Either (Either(..))
import Data.Foldable (all, traverse_)
import Data.Maybe (Maybe(..), fromMaybe)
import Data.String (Pattern(..), contains, split, stripPrefix, trim)
import Data.String.CodeUnits (toCharArray)
import Effect (Effect)
import Effect.Exception (throw)
import Host.System as S

safeName :: String -> Boolean
safeName value = value /= "" && all (\c -> c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9' || c == '.' || c == '_' || c == '-') (toCharArray value)

prefix :: String -> Either String String
prefix project = case project of
  "playerd" -> Right "playerd-"
  "rocksky-mcp" -> Right "rocksky-mcp-v"
  "bindings" -> Right "bindings-v"
  "desktop" -> Right "desktop-v"
  _ -> Left "Unknown release project"

resolveTag :: String -> Effect Unit
resolveTag project = do
  root <- S.root
  start <- case prefix project of
    Left problem -> throw problem
    Right value -> pure value
  input <- S.env "RELEASE_INPUT_TAG"
  refType <- S.env "GITHUB_REF_TYPE"
  ref <- S.env "GITHUB_REF_NAME"
  tag <- if input /= "" then pure input else if refType == "tag" then pure ref else do
    version <- if project == "desktop" then trim <$> S.run true root [ "jq", "-r", ".version", "desktop/src-tauri/tauri.conf.json" ] else do
      contents <- S.read (root <> if project == "bindings" then "/sdk/erlang/src/rocksky_erl.app.src" else "/" <> project <> "/Cargo.toml")
      let lines = filter (\line -> if project == "bindings" then contains (Pattern "{vsn,") line else case stripPrefix (Pattern "version") (trim line) of
            Just _ -> true
            Nothing -> false) (split (Pattern "\n") contents)
      case head lines >>= (\line -> index (split (Pattern "\"") line) 1) of
        Just value -> pure value
        Nothing -> throw "Could not read release version"
    when (version == "null" || not (safeName version)) $ throw "Invalid release version"
    pure (start <> version)
  unless (safeName tag) $ throw "Invalid release tag"
  output <- S.required "GITHUB_OUTPUT"
  S.append output ("tag=" <> tag <> "\n")
  when (project == "desktop") $ S.append output ("version=" <> fromMaybe tag (stripPrefix (Pattern "desktop-v") tag) <> "\n")

checksums :: String -> Array String -> Effect Unit
checksums directory files = traverse_ (\file -> do
  hash <- S.sha256 (directory <> "/" <> file)
  S.write (directory <> "/" <> file <> ".sha256") (hash <> "  " <> file <> "\n")) files

bindings :: String -> Effect Unit
bindings target = do
  unless (safeName target) $ throw "Invalid binding target"
  root <- S.root
  os <- S.platform
  feature <- S.env "FEATURES"
  override <- S.env "OUT"
  let out = if override == "" then root <> "/sdk/scripts/dist" else override
  let ext = if os == "darwin" then "dylib" else if os == "win32" then "dll" else "so"
  let nif = if os == "win32" then "rocksky_nif.dll" else "librocksky_nif." <> ext
  let features = if feature == "" then [] else [ "--features", feature ]
  S.mkdir out
  void $ S.run false root ([ "cargo", "build", "--release", "--manifest-path", root <> "/Cargo.toml", "-p", "rocksky-uniffi", "-p", "rocksky-nif" ] <> features)
  S.copy (root <> "/target/release/librocksky_uniffi." <> ext) (out <> "/librocksky_uniffi-" <> target <> "." <> ext)
  S.copy (root <> "/target/release/" <> nif) (out <> "/rocksky_nif-" <> target <> ".so")

packageNative :: String -> Effect Unit
packageNative project = do
  unless (project == "playerd" || project == "rocksky-mcp") $ throw "Invalid native release project"
  root <- S.root
  target <- S.required "RELEASE_TARGET"
  tag <- S.required "RELEASE_TAG"
  unless (safeName target && safeName tag) $ throw "Invalid release target or tag"
  os <- S.platform
  let dir = root <> "/" <> project
  let version = fromMaybe tag (stripPrefix (Pattern (project <> "-")) tag)
  let asset = project <> "-" <> version <> "-" <> target <> ".tar.gz"
  let bin = project <> if os == "win32" then ".exe" else ""
  let build = if project == "playerd" then "target/release" else "target/" <> target <> "/release"
  void $ S.run false dir [ "tar", "-C", build, "-czf", asset, bin ]
  checksums dir [ asset ]

upload :: String -> String -> Effect Unit
upload directory start = do
  root <- S.root
  tag <- S.required "RELEASE_TAG"
  let dir = root <> "/" <> directory
  files <- filter (\file -> case stripPrefix (Pattern start) file of
    Just _ -> true
    Nothing -> false) <$> S.entries dir
  when (null files) $ throw "No release assets found"
  void $ S.run false dir ([ "gh", "release", "upload", tag, "--clobber", "--" ] <> files)

stampDesktop :: Effect Unit
stampDesktop = do
  root <- S.root
  version <- S.required "VERSION"
  config <- S.run true (root <> "/desktop") [ "jq", "--arg", "v", version, ".version = $v", "src-tauri/tauri.conf.json" ]
  S.write (root <> "/desktop/src-tauri/tauri.conf.json") config

buildDesktop :: Effect Unit
buildDesktop = do
  root <- S.root
  target <- S.required "RELEASE_TARGET"
  bundles <- S.required "RELEASE_BUNDLES"
  key <- S.env "KLIPY_API_KEY"
  when (key /= "") $ S.setEnv "VITE_KLIPY_API_KEY" key
  void $ S.run false (root <> "/desktop") [ "bun", "run", "tauri", "build", "--target", target, "--bundles", bundles, "--config", "{\"build\":{\"beforeBuildCommand\":\"bun run build:prod\"}}" ]

packageDesktop :: Effect Unit
packageDesktop = do
  root <- S.root
  target <- S.required "RELEASE_TARGET"
  version <- S.required "VERSION"
  unless (safeName version) $ throw "Invalid desktop version"
  arch <- case target of
    "aarch64-apple-darwin" -> pure "aarch64"
    "x86_64-apple-darwin" -> pure "x64"
    _ -> throw "Expected a macOS desktop target"
  let dir = root <> "/desktop"
  let app = dir <> "/src-tauri/target/" <> target <> "/release/bundle/macos/Rocksky.app"
  let name = "Rocksky_" <> version <> "_" <> arch
  void $ S.run false dir [ "codesign", "--force", "--deep", "--sign", "-", app ]
  void $ S.run false dir [ "codesign", "--verify", "--deep", "--strict", "--verbose=2", app ]
  stage <- S.temporary
  S.finally (S.remove stage) do
    S.mkdir (stage <> "/Rocksky")
    void $ S.run false dir [ "ditto", app, stage <> "/Rocksky/Rocksky.app" ]
    void $ S.run false dir [ "ln", "-s", "/Applications", stage <> "/Rocksky/Applications" ]
    void $ S.run false dir [ "hdiutil", "create", "-volname", "Rocksky", "-srcfolder", stage <> "/Rocksky", "-ov", "-format", "UDZO", name <> ".dmg" ]
  void $ S.run false dir [ "ditto", "-c", "-k", "--sequesterRsrc", "--keepParent", app, name <> ".app.zip" ]
  checksums dir [ name <> ".dmg", name <> ".app.zip" ]
