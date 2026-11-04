module Rocksky.CI.Host.CI where

import Prelude
import CI.Docker.Engine as E
import Data.Array (filter)
import Data.Either (Either(..))
import Data.Foldable (traverse_)
import Data.String (Pattern(..), contains)
import Effect (Effect)
import Effect.Exception (throw, try)
import FluentCI.Plugin as P
import Rocksky.CI.Host.System as S
import Rocksky.CI.Production as Production
import Rocksky.CI.Test.Deploy as DeployTest
import Rocksky.CI.Test.Host as HostTest

validate :: Effect Unit
validate = do
  root <- S.root
  exact <- E.run ["node", "-e", "process.stdout.write('no trailing newline')"]
  unless (exact == "no trailing newline") $ throw "The engine changed command stdout"
  failure <- try (E.run ["node", "-e", "process.exit(23)"])
  case failure of
    Left _ -> pure unit
    Right _ -> throw "A failed command must reach PureScript error handling"
  DeployTest.main
  HostTest.main
  void $ S.run false root ["node", "--test", ".fluentci/tests/workflows.test.mjs"]

productionFilters :: Effect Unit
productionFilters = do
  output <- S.required "GITHUB_OUTPUT"
  S.append output ("filters=" <> Production.filters <> "\n")
  E.unwrap (P.output Production.filters)

buildMcp :: String -> Effect Unit
buildMcp target = do
  unless (target == "aarch64-apple-darwin" || target == "x86_64-apple-darwin" || target == "x86_64-pc-windows-msvc") $ throw "Expected a native macOS or Windows MCP target"
  root <- S.root
  void $ S.run false (root <> "/rocksky-mcp") ["cargo", "build", "--release", "--target", target]

buildPlayerd :: Effect Unit
buildPlayerd = do
  root <- S.root
  let directory = root <> "/playerd"
  traverse_ (void <<< S.run false directory)
    [ ["cargo", "build", "--release", "--locked"]
    , ["cargo", "test", "--release", "--locked", "--bin", "playerd"]
    , ["cargo", "test", "--release", "--locked", "-p", "rockbox-playback", "--lib"] ]

prepareDesktop :: Effect Unit
prepareDesktop = do
  root <- S.root
  void $ S.run false root ["bun", "install", "--frozen-lockfile"]
  void $ S.run false (root <> "/sdk/typescript") ["bun", "run", "build"]

nixBuild :: Effect Unit
nixBuild = do
  root <- S.root
  traverse_ (\project -> void $ S.run false root ["nix", "build", if project == "cli" then "./apps/cli" else ".#" <> project, "--print-build-logs", "-o", "result-" <> project])
    ["cli", "playerd", "rockskyd", "drift", "riff", "deezer", "spotify", "musicbrainz", "rocksky-desktop"]
  entries <- filter (contains (Pattern "result-")) <$> S.entries root
  void $ S.run false root (["ls", "-la"] <> entries)

flakehubPublish :: Effect Unit
flakehubPublish = do
  root <- S.root
  repository <- S.required "GITHUB_REPOSITORY"
  token <- S.required "GH_TOKEN"
  temporary <- S.temporary
  S.finally (S.remove temporary) do
    let revision = "2769db2f8d26fe4fa21b37428901bc2b6a54e012"
    let directory = temporary <> "/flakehub-push-" <> revision
    void $ S.run false root ["curl", "--fail", "--show-error", "--location", "--retry", "3", "https://github.com/DeterminateSystems/flakehub-push/archive/" <> revision <> ".tar.gz", "--output", temporary <> "/publisher.tar.gz"]
    void $ S.run false root ["tar", "-xzf", temporary <> "/publisher.tar.gz", "-C", temporary]
    -- Run the official publisher so its OIDC exchange, rolling versions, Git
    -- history handling and output-path registration keep their existing behavior.
    S.setEnv "GITHUB_ACTION_PATH" directory
    S.setEnv "INPUT_VISIBILITY" "public"
    S.setEnv "INPUT_NAME" "tsirysndr/rocksky"
    S.setEnv "INPUT_REPOSITORY" repository
    S.setEnv "INPUT_MIRROR" "false"
    S.setEnv "INPUT_DIRECTORY" ""
    S.setEnv "INPUT_GIT-ROOT" "."
    S.setEnv "INPUT_TAG" ""
    S.setEnv "INPUT_REV" ""
    S.setEnv "INPUT_ROLLING-MAJOR" ""
    S.setEnv "INPUT_ROLLING-MINOR" ""
    S.setEnv "INPUT_ROLLING" "true"
    S.setEnv "INPUT_HOST" "https://api.flakehub.com"
    S.setEnv "INPUT_LOG-DIRECTIVES" "flakehub_push=info"
    S.setEnv "INPUT_LOGGER" "full"
    S.setEnv "INPUT_GITHUB-TOKEN" token
    S.setEnv "INPUT_EXTRA-TAGS" ""
    S.setEnv "INPUT_EXTRA-LABELS" ""
    S.setEnv "INPUT_SPDX-EXPRESSION" ""
    S.setEnv "INPUT_ERROR-ON-CONFLICT" "false"
    S.setEnv "INPUT_INCLUDE-OUTPUT-PATHS" "true"
    S.setEnv "INPUT_SBOM-PATH" ""
    S.setEnv "INPUT_MY-FLAKE-IS-TOO-BIG" "false"
    S.setEnv "INPUT_SOURCE-BINARY" ""
    S.setEnv "INPUT_SOURCE-BRANCH" "main"
    S.setEnv "INPUT_SOURCE-PR" ""
    S.setEnv "INPUT_SOURCE-REVISION" ""
    S.setEnv "INPUT_SOURCE-TAG" ""
    S.setEnv "INPUT_SOURCE-URL" ""
    S.setEnv "INPUT__INTERNAL-STRICT-MODE" "false"
    S.setEnv "INPUT_FLAKEHUB-PUSH-BINARY" ""
    S.setEnv "INPUT_FLAKEHUB-PUSH-BRANCH" ""
    S.setEnv "INPUT_FLAKEHUB-PUSH-PR" ""
    S.setEnv "INPUT_FLAKEHUB-PUSH-REVISION" ""
    S.setEnv "INPUT_FLAKEHUB-PUSH-TAG" ""
    S.setEnv "INPUT_FLAKEHUB-PUSH-URL" ""
    void $ S.run false root ["node", directory <> "/dist/index.js"]
