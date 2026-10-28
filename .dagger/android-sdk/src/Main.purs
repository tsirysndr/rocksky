module Main where

import Prelude
import CI.Runtime as CI
import Dagger (Client)
import Dagger.Container as C
import Dagger.Modules as M
import Dagger.Query as Q
import Dagger.Types (Container, Platform(..))
import Data.Array (replicate)
import Data.Maybe (Maybe(..))
import Data.String (joinWith)
import Effect (Effect)
import Effect.Aff (Aff)

type SdkArgs =
  { jdkImage :: String
  , commandToolsVersion :: String
  , commandToolsSha256 :: String
  , platform :: String
  , buildTools :: String
  , ndk :: String
  , cmake :: String
  }

sdkArgs :: M.Arguments SdkArgs
sdkArgs = ado
  jdkImage <- M.defaultArgument "jdkImage" "eclipse-temurin:21-jdk-noble"
  commandToolsVersion <- M.defaultArgument "commandToolsVersion" "15859902"
  commandToolsSha256 <- M.defaultArgument "commandToolsSha256" "4e4c464f145a7512b57d088ac6c278c03c9eea610886b35a5e0804e74eedf583"
  platform <- M.defaultArgument "platform" "36"
  buildTools <- M.defaultArgument "buildTools" "36.0.0"
  ndk <- M.defaultArgument "ndk" "27.1.12297006"
  cmake <- M.defaultArgument "cmake" "3.22.1"
  in { jdkImage, commandToolsVersion, commandToolsSha256, platform, buildTools, ndk, cmake }

-- Android's Linux tool binaries require amd64, including on arm64 hosts.
-- License prompts are answered through stdin, without a shell pipeline.
sdk :: Client -> SdkArgs -> Aff Container
sdk client args = pure $ Q.containerWith
  (Q.defaultContainerOpts { platform = Just (Platform "linux/amd64") }) client
  # C.from args.jdkImage
  # C.withEnvVariable "DEBIAN_FRONTEND" "noninteractive"
  # C.withExec [ "apt-get", "update" ]
  # C.withExec [ "apt-get", "install", "-y", "--no-install-recommends", "ca-certificates", "curl", "unzip", "zip", "git", "python3", "make", "g++", "pkg-config", "libssl-dev" ]
  # C.withExec [ "curl", "--fail", "--location", "--retry", "3", "https://dl.google.com/android/repository/commandlinetools-linux-" <> args.commandToolsVersion <> "_latest.zip", "--output", "/tmp/android-tools.zip" ]
  # C.withExecWith [ "sha256sum", "--check", "-" ]
      (C.defaultWithExecOpts { stdin = Just (args.commandToolsSha256 <> "  /tmp/android-tools.zip\n") })
  # C.withExec [ "mkdir", "-p", "/opt/android-sdk/cmdline-tools" ]
  # C.withExec [ "unzip", "-q", "/tmp/android-tools.zip", "-d", "/tmp/android-tools" ]
  # C.withExec [ "mv", "/tmp/android-tools/cmdline-tools", "/opt/android-sdk/cmdline-tools/latest" ]
  # C.withExec [ "rm", "-f", "/tmp/android-tools.zip" ]
  # C.withEnvVariable "ANDROID_HOME" "/opt/android-sdk"
  # C.withEnvVariable "ANDROID_SDK_ROOT" "/opt/android-sdk"
  # C.withEnvVariable "ANDROID_NDK_HOME" ("/opt/android-sdk/ndk/" <> args.ndk)
  # C.withEnvVariable "ANDROID_NDK_ROOT" ("/opt/android-sdk/ndk/" <> args.ndk)
  # C.withEnvVariableWith "PATH" "/opt/android-sdk/cmdline-tools/latest/bin:/opt/android-sdk/platform-tools:$PATH"
      (C.defaultWithEnvVariableOpts { expand = Just true })
  # C.withExecWith [ "sdkmanager", "--sdk_root=/opt/android-sdk", "--licenses" ]
      (C.defaultWithExecOpts { stdin = Just (joinWith "" (replicate 100 "y\n")) })
  # C.withExec [ "sdkmanager", "--sdk_root=/opt/android-sdk", "platform-tools", "platforms;android-" <> args.platform, "build-tools;" <> args.buildTools, "ndk;" <> args.ndk, "cmake;" <> args.cmake ]

main :: Effect Unit
main = CI.runModule
  [ M.object_ "AndroidSdk" {}
      [ M.function "container" "Prepare a Linux amd64 Android SDK, NDK, CMake and JDK container; accepts Android SDK licenses." sdkArgs sdk ]
  ]
