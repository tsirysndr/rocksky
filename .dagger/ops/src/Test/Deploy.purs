module Test.Deploy where

import Prelude
import Data.Array (any, elem, filter, length, null)
import Data.Either (Either(..), isLeft)
import Data.Foldable (traverse_)
import Data.String (Pattern(..), contains, joinWith)
import Deploy as Deploy
import Effect (Effect)
import Effect.Aff (Aff, attempt, launchAff_, throwError)
import Effect.Class (liftEffect)
import Effect.Console (log)
import Effect.Exception (error)
import Effect.Ref as Ref
import Production as Production
import SSH as SSH
import Operations as Ops

assert :: String -> Boolean -> Aff Unit
assert name success = unless success $ throwError (error name)

sha :: String
sha = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"

runCase :: String -> String -> Aff (Array (Array String))
runCase selection failure = do
  calls <- liftEffect $ Ref.new []
  failed <- liftEffect $ Ref.new false
  let
    record args = liftEffect $ Ref.modify_ (_ <> [ args ]) calls
    run cmd = do
      record cmd.args
      alreadyFailed <- liftEffect $ Ref.read failed
      let shouldFail = case failure of
            "install" -> elem "install" cmd.args && any (contains (Pattern "rocksky-submissions.new")) cmd.args
            "health" -> elem "is-active" cmd.args
            "build" -> elem "gleam" cmd.args && elem "build" cmd.args
            "stale" -> elem "merge-base" cmd.args
            _ -> false
      when (shouldFail && not alreadyFailed) do
        liftEffect $ Ref.write true failed
        throwError (error ("injected " <> failure))
      pure $ if elem "uname" cmd.args then "x86_64" else
        if elem "sha256sum" cmd.args then
          if failure == "checksum" then "bad checksum" else
            "deb47c5300f3c99725e84cdb14d214c3b12bbd748b613b1698b938c894cb68eb  " <> Deploy.repo <> "/.deploy/riff-duckdb-1.5.5/duckdb.zip"
        else if elem "find" cmd.args then "libduckdb_static.a\nlibjson_extension.a\nlibparquet_extension.a\n" else
        if elem "rev-parse" cmd.args then sha else
        if elem "show" cmd.args then
          if failure /= "inactive" && any (_ `elem` cmd.args) [ "rocksky-jetstream.service", "rocksky-submissions.service", "rocksky-gleam.service", "rocksky-riff.service" ] then "active\n" else "inactive\n"
        else ""
    upload source destination = record [ "upload", source, destination ]
  selected <- case Deploy.validate sha selection of
    Left problem -> throwError (error problem)
    Right value -> pure value
  result <- attempt $ Deploy.deploy { run, upload } sha selected
  assert ("unexpected outcome: " <> failure) (isLeft result == (failure `elem` [ "install", "health", "build", "stale", "checksum" ]))
  history <- liftEffect $ Ref.read calls
  assert "host lock released" (any (_ == [ "rmdir", "/run/lock/rocksky-ci-deploy" ]) history)
  pure history

main :: Effect Unit
main = launchAff_ do
  assert "default SSH settings" (SSH.settings "" "" == Right { host: SSH.defaultHost, knownHosts: SSH.defaultKnownHosts })
  assert "SSH host override" (SSH.settings "deploy@example.test" "example.test ssh-ed25519 TEST" == Right { host: "deploy@example.test", knownHosts: "example.test ssh-ed25519 TEST" })
  assert "host override requires host keys" (isLeft $ SSH.settings "deploy@example.test" "")
  assert "reject SSH options" (isLeft $ SSH.settings "-oProxyCommand=bad" "key")
  details <- Ops.releaseDetails "bindings" "bindings-v1.0.0"
  assert "bindings remains prerelease" (details.extra == [ "--prerelease" ])
  desktop <- Ops.releaseDetails "desktop" "desktop-v1.2.3"
  assert "desktop release title" (desktop.title == "Rocksky Desktop 1.2.3")
  assert "desktop release notes preserved" (contains (Pattern "not notarized") desktop.notes)
  assert "reject AppView" (isLeft $ Deploy.validate sha "[\"appview\"]")
  assert "reject invalid SHA" (isLeft $ Deploy.validate "main; id" "[\"gleam\"]")
  assert "reject empty selection" (isLeft $ Deploy.validate sha "[]")
  assert "reject non-array" (isLeft $ Deploy.validate sha "{}")
  let units = joinWith " " $ Production.services >>= _.units
  traverse_ (\retired -> assert ("exclude " <> retired) (not $ contains (Pattern retired) units))
    [ "rocksky-appview.service", "rocksky.service", "rocksky-xrpc.service", "rocksky-feeds.service" ]
  good <- runCase "[\"rockskyd\"]" ""
  let
    lifecycle = filter (\args -> elem "systemctl" args && (elem "start" args || elem "stop" args))
    expected action = [ "systemctl", action, "rocksky-jetstream.service", "rocksky-submissions.service" ]
  assert "only active consumers restarted" (lifecycle good == [ expected "stop", expected "start" ])
  assert "checkout pinned SHA" (elem [ "git", "merge", "--ff-only", sha ] good)
  assert "both production binaries uploaded" (length (filter (elem "upload") good) == 2)
  traverse_ (\failure -> do
    history <- runCase "[\"rockskyd\"]" failure
    assert (failure <> " restores both binaries") (length (filter (\args -> elem "mv" args && any (contains (Pattern ".ci-rollback")) args) history) == 2)
    assert (failure <> " restarts original active services") (elem (expected "start") history)
    ) [ "install", "health" ]
  traverse_ (\failure -> do
    history <- runCase "[\"gleam\",\"rockskyd\"]" failure
    assert (failure <> " never stops services") (null $ lifecycle history)
    ) [ "inactive", "stale", "build" ]
  gleam <- runCase "[\"gleam\"]" ""
  assert "Gleam API restarted" (elem [ "systemctl", "start", "rocksky-gleam.service" ] gleam)
  assert "no deployment shell scripts" (not $ any (any (contains (Pattern ".sh"))) gleam)
  riff <- runCase "[\"riff\"]" ""
  assert "Riff static archive merged" (elem [ "ar", "-M" ] riff)
  assert "Riff builder uses no scripts" (not $ any (any (contains (Pattern ".py"))) riff)
  checksum <- runCase "[\"riff\"]" "checksum"
  assert "checksum mismatch never stops services" (null $ lifecycle checksum)
  assert "checksum mismatch never builds" (not $ any (elem "cargo") checksum)
  liftEffect $ log "Production deployment tests passed (validation, active units, pinned checkout, build failure, rollback and health failure)."
