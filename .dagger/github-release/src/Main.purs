module Main where

import Prelude
import CI.Runtime as CI
import Dagger (Client)
import Dagger.Container as C
import Dagger.Directory as D
import Dagger.Modules as M
import Dagger.Query as Q
import Dagger.Types (Container, Directory, Secret)
import Data.Array (elem, null)
import Data.Foldable (traverse_)
import Data.String (Pattern(..), contains, split, stripPrefix)
import Data.Maybe (Maybe(..))
import Effect (Effect)
import Effect.Aff (Aff, throwError)
import Effect.Exception (error)

type UploadArgs = { assets :: Directory, repository :: String, tag :: String, token :: Secret, runId :: String, clobber :: Boolean }

uploadArgs :: M.Arguments UploadArgs
uploadArgs = ado
  assets <- M.argument "assets"
  repository <- M.argument "repository"
  tag <- M.argument "tag"
  token <- M.argument "token"
  runId <- M.argument "runId"
  clobber <- M.defaultArgument "clobber" false
  in { assets, repository, tag, token, runId, clobber }

-- runId deliberately invalidates cached side effects. Reuse only within one attempt.
environment :: Client -> String -> Secret -> String -> Container
environment client repository token runId = Q.container client
  # C.from "node:24-bookworm-slim"
  # C.withExec [ "apt-get", "update" ]
  # C.withExec [ "apt-get", "install", "-y", "--no-install-recommends", "gh", "ca-certificates" ]
  # C.withSecretVariable "GH_TOKEN" token
  # C.withEnvVariable "GH_REPO" repository
  # C.withEnvVariable "RELEASE_RUN" runId

upload :: Client -> UploadArgs -> Aff String
upload client args = do
  when (args.repository == "" || args.tag == "" || args.runId == "") $
    throwError (error "repository, tag and runId must be nonempty")
  validateTag args.tag
  files <- D.entries args.assets
  when (null files) $ throwError (error "No release assets supplied")
  traverse_ (\file -> do
    when (contains (Pattern "#") file || contains (Pattern "\n") file) $
      throwError (error "Release asset names cannot contain # or newline")
    void $ C.sync $ environment client args.repository args.token args.runId
      # C.withDirectory "/assets" args.assets
      # C.withExec [ "test", "-f", "/assets/" <> file ]) files
  -- Prefix paths so asset names cannot be interpreted as flags.
  void $ C.sync $ environment client args.repository args.token args.runId
    # C.withDirectory "/assets" args.assets
    # C.withWorkdir "/assets"
    # C.withExec ([ "gh", "release", "upload", args.tag ] <>
        (if args.clobber then [ "--clobber" ] else []) <> [ "--" ] <> map ("./" <> _) files)
  pure "Release assets uploaded"

type CreateArgs = { repository :: String, tag :: String, commit :: String, title :: String, notes :: String, prerelease :: Boolean, token :: Secret, runId :: String }

createArgs :: M.Arguments CreateArgs
createArgs = ado
  repository <- M.argument "repository"
  tag <- M.argument "tag"
  commit <- M.argument "commit"
  title <- M.argument "title"
  notes <- M.argument "notes"
  prerelease <- M.defaultArgument "prerelease" false
  token <- M.argument "token"
  runId <- M.argument "runId"
  in { repository, tag, commit, title, notes, prerelease, token, runId }

-- List succeeds only when authentication/repository access succeeds. Never treat
-- an arbitrary failed `release view` (network/auth/rate limit) as a missing release.
ensure :: Client -> CreateArgs -> Aff String
ensure client args = do
  when (args.repository == "" || args.tag == "" || args.commit == "" || args.runId == "") $
    throwError (error "repository, tag, commit and runId must be nonempty")
  validateTag args.tag
  let base = environment client args.repository args.token args.runId
  existing <- C.stdout $ base
    # C.withExec [ "gh", "api", "--paginate", "repos/{owner}/{repo}/releases", "--jq", ".[].tag_name" ]
  unless (elem args.tag (split (Pattern "\n") existing)) $ void $ C.sync $ base
    # C.withExec ([ "gh", "release", "create", args.tag, "--title", args.title, "--notes", args.notes, "--target", args.commit ] <>
        if args.prerelease then [ "--prerelease" ] else [])
  pure "Release is ready"

validateTag :: String -> Aff Unit
validateTag tag = case stripPrefix (Pattern "-") tag of
  Just _ -> throwError (error "Release tags cannot begin with -")
  Nothing -> when (contains (Pattern "\n") tag) $ throwError (error "Invalid release tag")

main :: Effect Unit
main = CI.runModule
  [ M.object_ "GithubRelease" {}
      [ M.function "upload" "Upload files to an existing release in any GitHub repository." uploadArgs upload
      , M.function "ensure" "Create a release only if its tag is absent; preserve existing releases." createArgs ensure
      ]
  ]
