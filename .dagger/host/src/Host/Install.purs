module Host.Install where

import Prelude
import Data.Either (Either(..))
import Effect (Effect)
import Effect.Exception (throw)
import Host.System as S

type Release = { asset :: String, checksum :: String }

release :: String -> String -> Either String Release
release os cpu = case os <> "/" <> cpu of
  "darwin/arm64" -> Right { asset: "darwin_arm64", checksum: "781f4862c022a19b9a4c498b59e1d9cfda1ee3cdc8ce210e4545bd8842a7416d" }
  "darwin/x64" -> Right { asset: "darwin_amd64", checksum: "fdbe191c965d240ee9cc90719fa9dca1586805cbb89b0a0087314a84a0937354" }
  "linux/arm64" -> Right { asset: "linux_arm64", checksum: "ba9d55638636918a3404313511bceba5cc0af22f487c1c1b6a5ba60ce70a61bb" }
  "linux/x64" -> Right { asset: "linux_amd64", checksum: "c5ac777a5c99089869660943381136e22177b59a46412e310c2fef594760a041" }
  _ -> Left ("Unsupported Dagger platform: " <> os <> "/" <> cpu)

install :: Effect Unit
install = do
  os <- S.platform
  cpu <- S.arch
  selected <- case release os cpu of
    Left problem -> throw problem
    Right value -> pure value
  root <- S.root
  temp <- S.temporary
  S.finally (S.remove temp) do
    let archive = temp <> "/dagger.tar.gz"
    let destination = root <> "/.dagger/bin"
    void $ S.run false root [ "curl", "--fail", "--silent", "--show-error", "--location", "https://dl.dagger.io/dagger/releases/1.0.0-beta.21/dagger_v1.0.0-beta.21_" <> selected.asset <> ".tar.gz", "-o", archive ]
    digest <- S.sha256 archive
    when (digest /= selected.checksum) $ throw "Dagger release checksum mismatch"
    S.mkdir destination
    void $ S.run false root [ "tar", "-xzf", archive, "-C", destination, "dagger" ]
    void $ S.run false root [ destination <> "/dagger", "version" ]
    githubPath <- S.env "GITHUB_PATH"
    when (githubPath /= "") $ S.append githubPath (destination <> "\n")
