module Rocksky.CI.ReleaseClients where

import CI.Docker.Types (Client, Directory, File, Secret)
import Rocksky.CI.GithubRelease as Github
import Rocksky.CI.Artifacts as Artifacts
import CI.Effect (Aff)

upload :: Client -> { assets :: Directory, tag :: String, token :: Secret, runId :: String } -> Aff String
upload client args = Github.upload client { assets: args.assets, tag: args.tag, token: args.token, runId: args.runId, repository: "tsirysndr/rocksky", clobber: true }

ensure :: Client -> { tag :: String, commit :: String, token :: Secret, runId :: String, title :: String, notes :: String, prerelease :: Boolean } -> Aff String
ensure client args = Github.ensure client { tag: args.tag, commit: args.commit, token: args.token, runId: args.runId, title: args.title, notes: args.notes, prerelease: args.prerelease, repository: "tsirysndr/rocksky" }

binary :: Client -> { binary :: File, name :: String, executableName :: String } -> Aff Directory
binary = Artifacts.binary
