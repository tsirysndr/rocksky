module Test.Main where

import Prelude
import Data.Either (Either(..), isLeft)
import Data.String (Pattern(..), contains, trim)
import Effect (Effect)
import Effect.Console (log)
import Effect.Exception (throw, try)
import Host.Install as Install
import Host.Release as Release
import Host.System as S

assert :: String -> Boolean -> Effect Unit
assert name value = unless value $ throw name

main :: Effect Unit
main = do
  assert "unsupported platform rejected" (isLeft $ Install.release "win32" "x64")
  case Install.release "linux" "arm64" of
    Left problem -> throw problem
    Right release -> assert "arm64 release selected" (release.asset == "linux_arm64")
  assert "reject output injection" (not $ Release.safeName "tag\ntag=other")
  assert "reject path traversal" (not $ Release.safeName "../../bad")
  temp <- S.temporary
  original <- S.env "GITHUB_WORKSPACE"
  input <- S.env "RELEASE_INPUT_TAG"
  refType <- S.env "GITHUB_REF_TYPE"
  refName <- S.env "GITHUB_REF_NAME"
  output <- S.env "GITHUB_OUTPUT"
  releaseTag <- S.env "RELEASE_TAG"
  target <- S.env "RELEASE_TARGET"
  S.finally (do
    S.setEnv "GITHUB_WORKSPACE" original
    S.setEnv "RELEASE_INPUT_TAG" input
    S.setEnv "GITHUB_REF_TYPE" refType
    S.setEnv "GITHUB_REF_NAME" refName
    S.setEnv "GITHUB_OUTPUT" output
    S.setEnv "RELEASE_TAG" releaseTag
    S.setEnv "RELEASE_TARGET" target
    S.remove temp) do
    S.setEnv "GITHUB_WORKSPACE" temp
    S.setEnv "RELEASE_INPUT_TAG" ""
    S.setEnv "GITHUB_REF_TYPE" "branch"
    S.setEnv "GITHUB_OUTPUT" (temp <> "/output")
    S.mkdir (temp <> "/playerd/target/release")
    S.write (temp <> "/playerd/Cargo.toml") "[package]\nname = \"playerd\"\nversion = \"1.2.3\"\n"
    Release.resolveTag "playerd"
    resolved <- S.read (temp <> "/output")
    assert "manifest tag resolution" (trim resolved == "tag=playerd-1.2.3")
    S.setEnv "GITHUB_REF_TYPE" "tag"
    S.setEnv "GITHUB_REF_NAME" "playerd-v2.0.0"
    S.setEnv "RELEASE_INPUT_TAG" "playerd-v3.0.0"
    Release.resolveTag "playerd"
    overridden <- S.read (temp <> "/output")
    assert "manual tag wins" (contains (Pattern "tag=playerd-v3.0.0") overridden)
    S.setEnv "RELEASE_INPUT_TAG" "malicious\ntag=other"
    bad <- try $ Release.resolveTag "playerd"
    assert "newline tag fails" (isLeft bad)
    os <- S.platform
    let executable = if os == "win32" then "playerd.exe" else "playerd"
    S.write (temp <> "/playerd/target/release/" <> executable) "test executable fixture"
    S.setEnv "RELEASE_TARGET" "aarch64-apple-darwin"
    S.setEnv "RELEASE_TAG" "playerd-1.2.3"
    Release.packageNative "playerd"
    let artifact = "playerd-1.2.3-aarch64-apple-darwin.tar.gz"
    let path = temp <> "/playerd/" <> artifact
    digest <- S.sha256 path
    checksum <- S.read (path <> ".sha256")
    assert "checksum includes portable basename" (trim checksum == digest <> "  " <> artifact)
    listing <- S.run true (temp <> "/playerd") [ "tar", "-tzf", artifact ]
    assert "archive contains executable" (trim listing == executable)
  log "Host CI tests passed: platform selection, tag precedence, input validation, archive contents and checksums."
