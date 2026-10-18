module Rocksky.Schema.DropboxPaths
  ( dropboxPaths
  , DropboxPathsCols
  , SelectDropboxPaths
  ) where

import Prelude

import Data.JSDate (JSDate)
import Data.Nullable (Nullable)
import Drizzle.Dialect (Postgres)
import Drizzle.PG.Schema (table, text, timestamp, defaultNow, references)
import Drizzle.SQL (raw)
import Drizzle.Schema (Column, Table, columns, notNull, primaryKey, unique, defaultSQL)
import Rocksky.Schema.DropboxDirectories as DropboxDirectories

-- Indexes and table constraints are defined in the TS schema for drizzle-kit; queries do not need them.

type DropboxPathsCols =
  ( id :: Column Postgres String
  , path :: Column Postgres String
  , name :: Column Postgres String
  , dropboxId :: Column Postgres String
  , trackId :: Column Postgres String
  , directoryId :: Column Postgres (Nullable String)
  , fileId :: Column Postgres String
  , xataVersion :: Column Postgres (Nullable String)
  , createdAt :: Column Postgres JSDate
  , updatedAt :: Column Postgres JSDate
  )

dropboxPaths :: Table Postgres DropboxPathsCols
dropboxPaths = table "dropbox_paths"
  { id: text "xata_id" # notNull # primaryKey # defaultSQL (raw "xata_id()")
  , path: text "path" # notNull
  , name: text "name" # notNull
  , dropboxId: text "dropbox_id" # notNull
  , trackId: text "track_id" # notNull
  , directoryId: text "directory_id" # references (columns DropboxDirectories.dropboxDirectories).id
  , fileId: text "file_id" # notNull # unique
  , xataVersion: text "xata_version"
  , createdAt: timestamp "xata_createdat" # notNull # defaultNow
  , updatedAt: timestamp "xata_updatedat" # notNull # defaultNow
  }

type SelectDropboxPaths =
  { id :: String
  , path :: String
  , name :: String
  , dropboxId :: String
  , trackId :: String
  , directoryId :: Nullable String
  , fileId :: String
  , xataVersion :: Nullable String
  , createdAt :: JSDate
  , updatedAt :: JSDate
  }
