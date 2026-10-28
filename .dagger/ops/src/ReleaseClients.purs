-- Small typed adapters for local module dependencies. Keeping these handwritten
-- avoids requiring engine codegen just to compile the Rocksky wrappers offline.
module ReleaseClients where

import Dagger (Client)
import Dagger.Internal.Runtime as R
import Dagger.Types (Directory, File, Secret)
import Effect.Aff (Aff)

upload :: Client -> { assets :: Directory, tag :: String, token :: Secret, runId :: String } -> Aff String
upload client args = R.scalar "upload"
  [ R.objectArgument "assets" "ID!" args.assets
  , R.argument "repository" "String!" "tsirysndr/rocksky"
  , R.argument "tag" "String!" args.tag
  , R.objectArgument "token" "ID!" args.token
  , R.argument "runId" "String!" args.runId
  , R.argument "clobber" "Boolean!" true
  ] (R.select "githubRelease" [] client)

ensure :: Client -> { tag :: String, commit :: String, token :: Secret, runId :: String, title :: String, notes :: String, prerelease :: Boolean } -> Aff String
ensure client args = R.scalar "ensure"
  [ R.argument "repository" "String!" "tsirysndr/rocksky"
  , R.argument "tag" "String!" args.tag
  , R.argument "commit" "String!" args.commit
  , R.argument "title" "String!" args.title
  , R.argument "notes" "String!" args.notes
  , R.argument "prerelease" "Boolean!" args.prerelease
  , R.objectArgument "token" "ID!" args.token
  , R.argument "runId" "String!" args.runId
  ] (R.select "githubRelease" [] client)

binary :: Client -> { binary :: File, name :: String, executableName :: String } -> Directory
binary client args = R.select "binary"
  [ R.objectArgument "binary" "ID!" args.binary
  , R.argument "name" "String!" args.name
  , R.argument "executableName" "String!" args.executableName
  ] (R.select "releaseArtifacts" [] client)
