module Rocksky.Xrpc.App.Rocksky.Dropbox.GetFiles (register, retrieve) where

import Prelude
import Atproto.XrpcServer as Xrpc
import Control.Alt ((<|>))
import Control.Parallel (parallel, sequential)
import Data.Array (head)
import Data.JSDate as Date
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Nullable (Nullable)
import Data.String (Pattern(..), stripSuffix, trim)
import Data.Traversable (traverse)
import Drizzle.Builder (aliasTable, leftJoin, orderBy, run, selectFieldsFrom)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (columns, tableSQL, toSQL)
import Effect (Effect)
import Effect.Aff (Aff)
import Effect.Class (liftEffect)
import Foreign (Foreign)
import Rocksky.Context (Context)
import Rocksky.Lexicon (Server)
import Rocksky.Lib.Aff (recoverWith, retryTransientDb, timeoutMs)
import Rocksky.Lib.Foreign as F
import Rocksky.Schema as T
import Rocksky.Xrpc.Util as Util

type Directory = { id :: String, name :: String, fileId :: String, path :: String, parentId :: Nullable String, createdAt :: Date.JSDate, updatedAt :: Date.JSDate }
type File = { id :: String, name :: String, fileId :: String, directoryId :: Nullable String, trackId :: Nullable String, createdAt :: Date.JSDate, updatedAt :: Date.JSDate }
type Listing a = { item :: a, parent :: Foreign, parent_dir :: Foreign }

retrieve :: Context -> Maybe String -> Maybe String -> Aff Foreign
retrieve ctx at did = do
  let
    parent = aliasTable T.dropboxDirectories "parent"
    parentDir = aliasTable T.dropboxDirectories "parent_dir"
    p = columns parent
    pd = columns parentDir
    path = fromMaybe "/Music" at
    condition = SQL.and (SQL.eq (toSQL T.usersC.did) (SQL.string (fromMaybe "" did)))
      (SQL.or (SQL.eq (toSQL p.path) (SQL.string (trim (fromMaybe path (stripSuffix (Pattern "/") path)))))
        (SQL.eq (toSQL p.fileId) (SQL.string (trim (fromMaybe "" at)))))
  rows <- sequential $ { directories: _, files: _ }
    <$> parallel (run ctx.db (selectFieldsFrom { item: tableSQL T.dropboxDirectories, parent: tableSQL parent, parent_dir: tableSQL parentDir } T.dropboxDirectories
      # leftJoin T.dropbox (SQL.eq (toSQL T.dropboxC.id) (toSQL T.dropboxDirectoriesC.dropboxId))
      # leftJoin T.users (SQL.eq (toSQL T.dropboxC.userId) (toSQL T.usersC.id))
      # leftJoin parent (SQL.eq (toSQL p.id) (toSQL T.dropboxDirectoriesC.parentId))
      # leftJoin parentDir (SQL.eq (toSQL pd.id) (toSQL p.parentId))
      # where_ condition # orderBy [SQL.asc (toSQL T.dropboxDirectoriesC.name)]) :: Aff (Array (Listing Directory)))
    <*> parallel (run ctx.db (selectFieldsFrom { item: tableSQL T.dropboxPaths, parent: tableSQL parent, parent_dir: tableSQL parentDir } T.dropboxPaths
      # leftJoin parent (SQL.eq (toSQL p.id) (toSQL T.dropboxPathsC.directoryId))
      # leftJoin parentDir (SQL.eq (toSQL pd.id) (toSQL p.parentId))
      # leftJoin T.dropbox (SQL.eq (toSQL T.dropboxC.id) (toSQL T.dropboxPathsC.dropboxId))
      # leftJoin T.users (SQL.eq (toSQL T.dropboxC.userId) (toSQL T.usersC.id))
      # where_ condition # orderBy [SQL.asc (toSQL T.dropboxPathsC.name)]) :: Aff (Array (Listing File)))
  let
    parentField key = fromMaybe (F.toForeign {}) ((head rows.directories >>= F.path key <<< F.toForeign) <|> (head rows.files >>= F.path key <<< F.toForeign))
    directory = F.deleteKeys ["createdAt", "updatedAt", "xataVersion"] (parentField "parent")
    parentDirectory = F.deleteKeys ["createdAt", "updatedAt", "xataVersion"] (parentField "parent_dir")
  liftEffect do
    directories <- traverse (\{ item } -> do
      createdAt <- Date.toISOString item.createdAt
      updatedAt <- Date.toISOString item.updatedAt
      pure { id: item.id, name: item.name, fileId: item.fileId, path: item.path, parentId: item.parentId, createdAt, updatedAt }) rows.directories
    files <- traverse (\{ item } -> do
      createdAt <- Date.toISOString item.createdAt
      updatedAt <- Date.toISOString item.updatedAt
      pure { id: item.id, name: item.name, fileId: item.fileId, directoryId: item.directoryId, trackId: item.trackId, createdAt, updatedAt }) rows.files
    pure (F.toForeign { directory, parentDirectory, directories, files })

register :: Server -> Context -> Effect Unit
register server ctx = Xrpc.method server "app.rocksky.dropbox.getFiles"
  { auth: Just ctx.authVerifier
  , handler: \input -> Xrpc.Json <$> recoverWith (F.toForeign { files: [] :: Array Foreign, directories: [] :: Array Foreign })
      (timeoutMs 10000 (retryTransientDb (retrieve ctx (Util.paramString input "at") (Util.authDid input)))) }
