module Main where

import Prelude
import CI.Runtime as CI
import Dagger (Client)
import Dagger.Container as C
import Dagger.Modules as M
import Dagger.Internal.Runtime as R
import Dagger.Query as Q
import Dagger.Types (Container, Directory, File, Secret, Platform(..))
import Data.Array (elem)
import Data.Maybe (Maybe(..))
import Data.String (Pattern(..), contains, split)
import Effect (Effect)
import Effect.Aff (Aff, throwError)
import Effect.Exception (error)

type BuildArgs = { builder :: Container, source :: Directory, projectDir :: String, profile :: String, token :: Secret, runId :: String }

buildArgs :: String -> M.Arguments BuildArgs
buildArgs defaultProfile = ado
  builder <- M.argument "builder"
  source <- M.argument "source"
  projectDir <- M.defaultArgument "projectDir" "."
  profile <- M.defaultArgument "profile" defaultProfile
  token <- M.argument "token"
  runId <- M.argument "runId"
  in { builder, source, projectDir, profile, token, runId }

-- Accept a prepared Linux Android toolchain so projects control Node, EAS CLI,
-- JDK, SDK, NDK, Bun and native tooling instead of inheriting Rocksky's versions.
build :: String -> Client -> BuildArgs -> Aff File
build format _ args = do
  when (args.projectDir == "" || contains (Pattern "\\") args.projectDir ||
      elem ".." (split (Pattern "/") args.projectDir) ||
      elem "" (split (Pattern "/") args.projectDir)) $
    throwError (error "projectDir must be a relative path inside source")
  when (args.profile == "" || args.runId == "") $ throwError (error "profile and runId must be nonempty")
  let output = "/eas-output/app." <> format
  let built = args.builder
        # C.withDirectoryWith "/src" args.source
            (C.defaultWithDirectoryOpts { exclude = Just
              [ ".git", ".dagger", "**/node_modules", "**/target", "**/.gradle", "**/.env", "**/.env.*", "**/credentials.json", "**/*.jks", "**/*.keystore" ] })
        # C.withWorkdir ("/src/" <> args.projectDir)
        # C.withEnvVariable "CI" "1"
        # C.withEnvVariable "EAS_NO_VCS" "1"
        # C.withEnvVariable "EAS_PROJECT_ROOT" "/src"
        # C.withSecretVariable "EXPO_TOKEN" args.token
        -- EAS profiles may increment remote versions, so each build needs a nonce.
        # C.withEnvVariable "EAS_BUILD_RUN" args.runId
        # C.withExec [ "mkdir", "-p", "/eas-output" ]
        # C.withExec [ "eas", "build", "--platform", "android", "--profile", args.profile, "--local", "--non-interactive", "--output", output ]
        # C.withExec [ "test", "-s", output ]
  -- The profile determines the format. Verify contents, not just an extension.
  entries <- C.stdout $ built # C.withExec [ "jar", "tf", output ]
  let marker = if format == "aab" then "BundleConfig.pb" else "AndroidManifest.xml"
  unless (elem marker (split (Pattern "\n") entries)) $
    throwError (error ("EAS profile did not produce an " <> format))
  pure $ C.file output built

type ToolchainArgs = { sdk :: Container, easVersion :: String, nodeImage :: String, bunImage :: String }

toolchainArgs :: M.Arguments ToolchainArgs
toolchainArgs = ado
  sdk <- M.argument "sdk"
  easVersion <- M.argument "easVersion"
  nodeImage <- M.defaultArgument "nodeImage" "node:22-bookworm-slim"
  bunImage <- M.defaultArgument "bunImage" "oven/bun:1.4.2"
  in { sdk, easVersion, nodeImage, bunImage }

toolchain :: Client -> ToolchainArgs -> Aff Container
toolchain client args = do
  when (args.easVersion == "") $ throwError (error "An EAS CLI version is required")
  let image ref = Q.containerWith (Q.defaultContainerOpts { platform = Just (Platform "linux/amd64") }) client # C.from ref
  pure $ args.sdk
    # C.withDirectory "/usr/local" (C.directory "/usr/local" (image args.nodeImage))
    # C.withFile "/usr/local/bin/bun" (C.file "/usr/local/bin/bun" (image args.bunImage))
    # C.withExec [ "npm", "install", "--global", "eas-cli@" <> args.easVersion ]
    # C.withExec [ "node", "--version" ]
    # C.withExec [ "eas", "--version" ]

type AndroidArgs =
  { source :: Directory, projectDir :: String, profile :: String, format :: String
  , token :: Secret, runId :: String, easVersion :: String
  }

androidArgs :: M.Arguments AndroidArgs
androidArgs = ado
  source <- M.argument "source"
  projectDir <- M.defaultArgument "projectDir" "."
  profile <- M.defaultArgument "profile" ""
  format <- M.defaultArgument "format" "aab"
  token <- M.argument "token"
  runId <- M.argument "runId"
  easVersion <- M.argument "easVersion"
  in { source, projectDir, profile, format, token, runId, easVersion }

-- Convenience composition for CI. Advanced consumers can customize the SDK
-- container and call toolchain + aab/apk themselves.
android :: Client -> AndroidArgs -> Aff File
android client args = do
  unless (elem args.format [ "aab", "apk" ]) $ throwError (error "format must be aab or apk")
  let sdk = R.select "container" [] (R.select "androidSdk" [] client)
  builder <- toolchain client { sdk, easVersion: args.easVersion, nodeImage: "node:22-bookworm-slim", bunImage: "oven/bun:1.4.2" }
  build args.format client
    { builder, source: args.source, projectDir: args.projectDir
    , profile: if args.profile /= "" then args.profile else if args.format == "aab" then "production" else "apk"
    , token: args.token, runId: args.runId
    }

main :: Effect Unit
main = CI.runModule
  [ M.object_ "EasAndroid" {}
      [ M.function "android" "Compose Android SDK and EAS toolchain to build an AAB or APK locally in CI." androidArgs android
      , M.function "toolchain" "Add Node, Bun and a caller-pinned EAS CLI to an Android SDK container." toolchainArgs toolchain
      , M.function "aab" "Build a production Android App Bundle locally with a prepared Android toolchain." (buildArgs "production") (build "aab")
      , M.function "apk" "Build an APK locally with a prepared Android toolchain." (buildArgs "apk") (build "apk")
      ]
  ]
