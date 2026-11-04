-- Host filesystem and process primitives use native Node subprocesses through
-- FluentCI; no Node or HTTP runtime is imported into the Wasm guest.
module Rocksky.CI.Host.System where

import Prelude
import CI.Docker.Engine as E
import CI.Module as M
import Data.Array as Data.Array
import Data.Argonaut.Parser (jsonParser)
import Data.Argonaut.Core (stringify)
import Data.Argonaut.Encode (encodeJson)
import Data.Either (Either(..))
import Data.Maybe (Maybe(..))
import Data.String (trim)
import Effect (Effect)
import Effect.Exception (throw, try, throwException)
import Effect.Ref as Ref
import Effect.Unsafe (unsafePerformEffect)
import FluentCI.Plugin as P
import Foreign.Object (Object)
import Foreign.Object as Object

overrides :: Ref.Ref (Object String)
overrides = unsafePerformEffect (Ref.new Object.empty)

native :: String -> Array String -> Effect String
native code args = E.run (["node", "-e", code, "--"] <> args)

env :: String -> Effect String
env name = do
  values <- Ref.read overrides
  case Object.lookup name values of
    Just value -> pure value
    Nothing -> E.unwrap (P.getEnv name)

setEnv :: String -> String -> Effect Unit
setEnv name value = Ref.modify_ (Object.insert name value) overrides

platform :: Effect String
platform = native "process.stdout.write(process.platform)" []
arch :: Effect String
arch = native "process.stdout.write(process.arch)" []
cwd :: Effect String
cwd = native "process.stdout.write(process.cwd())" []
read :: String -> Effect String
read path = native "process.stdout.write(require('node:fs').readFileSync(process.argv[1],'utf8'))" [path]
write :: String -> String -> Effect Unit
write path text = void $ native "require('node:fs').writeFileSync(process.argv[1],process.argv[2])" [path,text]
append :: String -> String -> Effect Unit
append path text = void $ native "require('node:fs').appendFileSync(process.argv[1],process.argv[2])" [path,text]
mkdir :: String -> Effect Unit
mkdir path = void $ native "require('node:fs').mkdirSync(process.argv[1],{recursive:true})" [path]
temporary :: Effect String
temporary = native "process.stdout.write(require('node:fs').mkdtempSync(require('node:path').join(require('node:os').tmpdir(),'rocksky-ci-')))" []
remove :: String -> Effect Unit
remove path = void $ native "require('node:fs').rmSync(process.argv[1],{recursive:true,force:true})" [path]
exists :: String -> Effect Boolean
exists path = (_ == "true") <$> native "process.stdout.write(String(require('node:fs').existsSync(process.argv[1])))" [path]
entries :: String -> Effect (Array String)
entries path = do
  raw <- native "process.stdout.write(JSON.stringify(require('node:fs').readdirSync(process.argv[1])))" [path]
  case jsonParser raw of
    Left problem -> throw problem
    Right value -> M.json value
copy :: String -> String -> Effect Unit
copy source destination = void $ native "require('node:fs').cpSync(process.argv[1],process.argv[2],{recursive:true,verbatimSymlinks:true,preserveTimestamps:true})" [source,destination]
sha256 :: String -> Effect String
sha256 path = native "process.stdout.write(require('node:crypto').createHash('sha256').update(require('node:fs').readFileSync(process.argv[1])).digest('hex'))" [path]

execute :: Boolean -> String -> String -> Array String -> Effect { code :: Int, output :: String }
execute capture dir program args = do
  values <- Ref.read overrides
  let script = "const {spawnSync}=require('node:child_process');const [cwd,program,args,capture]=process.argv.slice(1).map(JSON.parse);const r=spawnSync(program,args,{cwd,encoding:'utf8',stdio:['inherit',capture?'pipe':2,'inherit'],maxBuffer:64*1024*1024});if(r.error)throw r.error;process.stdout.write(JSON.stringify({code:r.status??1,output:r.stdout??''}));"
  let pipeline = Object.fold (\p key value -> P.withSecret key (P.secret key value) p) (P.pipeline "host-command") values
  raw <- E.unwrap $ P.stdout $ pipeline # P.exec ["node", "-e", script, "--", stringify (encodeJson dir), stringify (encodeJson program), stringify (encodeJson args), stringify (encodeJson capture)]
  case jsonParser raw of
    Left problem -> throw problem
    Right value -> M.json value

run :: Boolean -> String -> Array String -> Effect String
run capture dir argv = case Data.Array.uncons argv of
  Nothing -> throw "Empty command"
  Just { head, tail } -> do
    result <- execute capture dir head tail
    when (result.code /= 0) $ throw (head <> " failed: " <> show result.code)
    pure result.output

root :: Effect String
root = do
  workspace <- env "GITHUB_WORKSPACE"
  if workspace /= "" then pure workspace else do
    directory <- cwd
    trim <$> run true directory ["git", "rev-parse", "--show-toplevel"]

required :: String -> Effect String
required name = do
  value <- env name
  if value == "" then throw ("Missing environment variable " <> name) else pure value

finally :: forall a. Effect Unit -> Effect a -> Effect a
finally cleanup action = do
  outcome <- try action
  cleanup
  case outcome of
    Left failure -> throwException failure
    Right value -> pure value
