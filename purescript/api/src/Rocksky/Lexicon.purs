-- | Loads the lexicon JSON documents at runtime (replacing the generated
-- | `src/lexicon/**` TypeScript) and builds the XRPC server and validator.
module Rocksky.Lexicon
  ( loadLexicons
  , lexiconDirs
  , createServer
  , module Reexport
  ) where

import Prelude

import Atproto.XrpcServer (Server, Options)
import Atproto.XrpcServer (Server) as Reexport
import Atproto.XrpcServer as XrpcServer
import Data.Array (concat, filter)
import Data.Either (Either(..))
import Data.Maybe (Maybe(..))
import Data.String (Pattern(..))
import Data.String as String
import Data.Traversable (for)
import Effect (Effect)
import Effect.Aff (Aff, error, throwError)
import Effect.Class (liftEffect)
import Foreign (Foreign)
import Node.Encoding (Encoding(..))
import Node.FS.Aff (readTextFile, readdir, stat)
import Node.FS.Stats (isDirectory)
import Node.Path as Path
import Node.Process (cwd, lookupEnv)
import Rocksky.Lib.Foreign (parseJson)

-- | Where the lexicon JSON lives: `LEXICONS_DIR` (comma separated) or, by
-- | default, `../apps/api/lexicons` and `../apps/api/src/tealfm/lexicons`
-- | relative to the working directory.
lexiconDirs :: Effect (Array String)
lexiconDirs = do
  fromEnv <- lookupEnv "LEXICONS_DIR"
  dir <- cwd
  pure case fromEnv of
    Just v -> filter (_ /= "") (map String.trim (String.split (Pattern ",") v))
    Nothing ->
      [ Path.concat [ dir, "..", "apps", "api", "lexicons" ]
      , Path.concat [ dir, "..", "apps", "api", "src", "tealfm", "lexicons" ]
      ]

jsonFiles :: String -> Aff (Array String)
jsonFiles dir = do
  entries <- readdir dir
  nested <- for entries \e -> do
    let p = Path.concat [ dir, e ]
    s <- stat p
    if isDirectory s then jsonFiles p
    else pure (if String.contains (Pattern ".json") e then [ p ] else [])
  pure (concat nested)

-- | Every `*.json` under the lexicon directories, parsed.
loadLexicons :: Aff (Array Foreign)
loadLexicons = do
  dirs <- liftEffect lexiconDirs
  files <- concat <$> for dirs jsonFiles
  for files \f -> do
    txt <- readTextFile UTF8 f
    case parseJson txt of
      Left e -> throwError (error ("Invalid lexicon " <> f <> ": " <> e))
      Right doc -> pure doc

createServer :: Array Foreign -> Options -> Effect Server
createServer = XrpcServer.createServer
