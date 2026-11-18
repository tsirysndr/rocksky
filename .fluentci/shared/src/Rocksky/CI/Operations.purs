module Rocksky.CI.Operations where

import Prelude
import CI.Docker.Container as C
import CI.Docker.Directory as D
import CI.Docker.Types (Container)
import Data.Array (filter)
import Data.Maybe (Maybe(..), fromMaybe)
import Data.String (Pattern(..), contains, stripPrefix)
import CI.Effect (Aff, throwError)
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
