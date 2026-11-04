module Rocksky.CI.Test.Docker where

import Prelude
import CI.Docker.Container as C
import CI.Docker.Engine as E
import CI.Docker.Query as Q
import CI.Docker.Types (Directory(..))
import CI.Effect (bracket)
import Data.String (trim)
import Data.Maybe as Data.Maybe
import Effect (Effect)
import Effect.Exception (throw)

assert :: String -> Boolean -> Effect Unit
assert label success = unless success (throw label)

main :: Effect Unit
main = bracket E.createClient E.cleanup \client -> do
  let base = Q.container client # C.from "node:24-bookworm-slim"
        # C.withWorkdir "/work"
        # C.withNewFile "/work/value" "base"
  let left = base # C.withNewFile "/work/value" "left"
  first <- C.stdout (left # C.withExec ["cat", "/work/value"])
  assert "left branch changed" (first == "left")
  original <- C.stdout (base # C.withExec ["cat", "/work/value"])
  assert "parent snapshot preserved" (original == "base")
  exported <- E.exportFile client (C.file "/work/value" base)
  contents <- E.run ["cat", exported]
  assert "export reads the selected snapshot" (contents == "base")
  literal <- C.stdout (base # C.withExec ["printf", "%s", "quotes ' \" and $PATH; data"])
  assert "literal argv" (literal == "quotes ' \" and $PATH; data")
  stdin <- C.stdout (base # C.withExecWith ["cat"] (C.defaultWithExecOpts { stdin = Data.Maybe.Just "stdin\nvalue" }))
  assert "stdin transport" (stdin == "stdin\nvalue")
  -- Reproduce narrow-checkout links and runner-owned Git input directories.
  let checkout = client.temporary <> "/checkout"
  void $ E.run ["mkdir", "-p", checkout <> "/nested", checkout <> "/dist", checkout <> "/node_modules"]
  void $ E.shell ("printf '%s' fixture > " <> E.quote (checkout <> "/nested/data.txt"))
  void $ E.shell ("printf '%s' executable > " <> E.quote (checkout <> "/dist/fixture"))
  void $ E.shell ("printf '%s' excluded > " <> E.quote (checkout <> "/.env"))
  void $ E.run ["chmod", "0755", checkout <> "/dist/fixture"]
  void $ E.run ["ln", "-s", "../api/lexicons", checkout <> "/lexicons"]
  void $ E.run ["ln", "-s", "nested/data.txt", checkout <> "/internal"]
  let copied = base # C.withDirectoryWith "/copy" (HostDirectory checkout)
        (C.defaultWithDirectoryOpts { exclude = Data.Maybe.Just ["node_modules", ".env"] })
  link <- trim <$> C.stdout (copied # C.withExec ["readlink", "/copy/lexicons"])
  assert "escaping relative symlink is preserved" (link == "../api/lexicons")
  content <- C.stdout (copied # C.withExec ["cat", "/copy/internal"])
  assert "internal relative symlink still resolves" (content == "fixture")
  void $ C.sync (copied # C.withExec ["test", "-L", "/copy/lexicons"]
    # C.withExec ["test", "!", "-e", "/copy/lexicons"]
    # C.withExec ["test", "-x", "/copy/dist/fixture"]
    # C.withExec ["test", "!", "-e", "/copy/.env"]
    # C.withExec ["test", "!", "-e", "/copy/node_modules"])
  owner <- trim <$> C.stdout (copied # C.withExec ["stat", "-c", "%u:%g", "/copy/nested/data.txt"])
  currentUser <- trim <$> C.stdout (copied # C.withExec ["sh", "-c", "printf '%s:%s' \"$(id -u)\" \"$(id -g)\""])
  assert "host UID is not restored inside the container" (owner == currentUser)
  let git = copied # C.withExec ["apt-get", "update"]
        # C.withExec ["apt-get", "install", "-y", "--no-install-recommends", "git"]
        # C.withWorkdir "/copy"
        # C.withExec ["git", "init", "--quiet"]
        # C.withExec ["git", "add", "--force", "dist"]
  tracked <- trim <$> C.stdout (git # C.withExec ["git", "ls-files", "dist"])
  assert ("copied dashboard Git index must contain only the input fixture: " <> tracked) (tracked == "dist/fixture")
  let redis = Q.container client # C.from "redis:7-alpine" # C.asService
  pong <- C.stdout (base # C.withServiceBinding "redis" redis
    # C.withExec ["node", "-e", "const c=require('node:net').connect(6379,'redis',()=>c.write('PING\\r\\n'));c.setTimeout(5000,()=>process.exit(1));c.on('data',b=>{process.stdout.write(b);c.end()});c.on('error',()=>process.exit(1))"])
  assert "private service DNS and readiness" (trim pong == "+PONG")
  let database name = Q.container client # C.from "postgres:16-alpine"
        # C.withEnvVariable "POSTGRES_USER" "postgres"
        # C.withEnvVariable "POSTGRES_PASSWORD" "postgres"
        # C.withEnvVariable "POSTGRES_DB" name # C.asService
  let firstDatabase = database "fluentci_first"
  let secondDatabase = database "fluentci_second"
  void $ C.sync (base # C.withServiceBinding "db1" firstDatabase # C.withServiceBinding "db2" secondDatabase)
  one <- E.startService client firstDatabase
  two <- E.startService client secondDatabase
  assert "database services have distinct environment identities" (one /= two)
  result <- E.run (E.docker client ["exec", two, "psql", "-U", "postgres", "-d", "fluentci_second", "-Atc", "SELECT 42"])
  assert "the selected PostgreSQL database exists" (trim result == "42")
