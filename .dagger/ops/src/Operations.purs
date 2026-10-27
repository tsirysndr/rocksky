module Operations where

import Prelude
import Dagger.Container as C
import Dagger.Directory as D
import Dagger.Secret as Secret
import Dagger.Types (Container, Secret, ReturnType(..))
import Data.Array (filter, head)
import Data.Foldable (foldM)
import Data.Maybe (Maybe(..), fromMaybe)
import Data.String (Pattern(..), contains, split, stripPrefix, trim)
import Effect.Aff (Aff, throwError)
import Effect.Exception (error)

apt :: Array String -> Container -> Container
apt packages container = container
  # C.withExec [ "apt-get", "update" ]
  # C.withExec ([ "apt-get", "install", "-y", "--no-install-recommends" ] <> packages)
  # C.withExec [ "rm", "-rf", "/var/lib/apt/lists" ]

checksum :: String -> Container -> Container
checksum file = C.withExecWith [ "sha256sum", file ]
  (C.defaultWithExecOpts { redirectStdout = Just (file <> ".sha256") })

verify :: String -> String -> Container -> Container
verify hash file = C.withExecWith [ "sha256sum", "--check", "-" ]
  (C.defaultWithExecOpts { stdin = Just (hash <> "  " <> file <> "\n") })

singleFile :: String -> String -> Container -> Aff String
singleFile folder suffix container = do
  files <- D.entries (C.directory folder container)
  case filter (contains (Pattern suffix)) files of
    [ file ] -> pure (folder <> "/" <> file)
    _ -> throwError (error ("Expected exactly one " <> suffix <> " in " <> folder))

releaseDetails :: String -> String -> Aff { title :: String, notes :: String, extra :: Array String }
releaseDetails project tag = case project of
  "playerd" -> pure { title: "playerd " <> drop "playerd-", notes: "Rocksky remote player daemon. Managed by playerd-release.yml.", extra: [] }
  "rocksky-mcp" -> pure { title: "rocksky-mcp " <> drop "rocksky-mcp-", notes: "Model Context Protocol server for Rocksky. Managed by rocksky-mcp-release.yml.", extra: [] }
  "bindings" -> pure { title: "Rocksky binding libraries (" <> tag <> ")", notes: "Native binding libraries (librocksky_uniffi + rocksky_nif) for the Rocksky SDKs. Managed by bindings-release.yml.", extra: [ "--prerelease" ] }
  "desktop" -> pure { title: "Rocksky Desktop " <> drop "desktop-v", notes: desktopNotes, extra: [] }
  _ -> throwError (error "Unsupported release project")
  where
  drop prefix = fromMaybe tag (stripPrefix (Pattern prefix) tag)

desktopNotes :: String
desktopNotes = """Rocksky desktop player.

## macOS

```sh
brew install --cask tsirysndr/tap/rocksky
```

The app is **ad-hoc signed and not notarized** (no Apple Developer
account yet), so the first launch is blocked. Open it once, then go to
**System Settings → Privacy & Security** and click **Open Anyway** next
to the Rocksky message. Or clear the quarantine flag yourself:

```sh
xattr -dr com.apple.quarantine /Applications/Rocksky.app
```

## Linux

Grab the `.deb`, `.rpm`, or `.AppImage` below.

Managed by `.github/workflows/desktop-release.yml`.
"""

nix :: Secret -> Container -> Aff Unit
nix token environment = do
  let resolved = environment # C.withWorkdir "/src"
        # C.withExec [ "nix", "build", "--inputs-from", ".", "nixpkgs#cachix", "--no-link", "--print-out-paths" ]
  output <- C.stdout resolved
  path <- case head (filter (_ /= "") (split (Pattern "\n") (trim output))) of
    Just value -> pure value
    Nothing -> throwError (error "Nix did not return the Cachix store path")
  let base = resolved # C.withExec [ path <> "/bin/cachix", "use", "rocksky" ]
  built <- foldM (\container project -> pure $ container
    # C.withExec [ "nix", "build", if project == "cli" then "./apps/cli" else ".#" <> project, "--print-build-logs", "-o", "result-" <> project ]) base
    [ "cli", "playerd", "rockskyd", "drift", "riff", "deezer", "spotify", "musicbrainz" ]
  let desktop = built # C.withExecWith [ "nix", "build", ".#rocksky-desktop", "--print-build-logs", "-o", "result-rocksky-desktop" ]
        (C.defaultWithExecOpts { expect = Just ReturnTypeAny })
  void $ C.sync desktop -- Preserve the existing best-effort Linux desktop policy.
  credential <- Secret.plaintext token
  when (credential /= "") do
    entries <- D.entries (C.directory "/src" desktop)
    pushed <- foldM (\container result -> do
      exists <- C.exists ("/src/" <> result) container
      pure $ if exists then container # C.withExec [ path <> "/bin/cachix", "push", "rocksky", result ] else container)
      desktop (filter (contains (Pattern "result-")) entries)
    void $ C.sync pushed
