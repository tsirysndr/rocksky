module Rocksky.Schema.GoogleDriveDirectories
  ( googleDriveDirectories
  , GoogleDriveDirectoriesCols
  , SelectGoogleDriveDirectories
  ) where

import Prelude

import Data.JSDate (JSDate)
import Data.Nullable (Nullable)
import Drizzle.Dialect (Postgres)
import Drizzle.PG.Schema (table, text, timestamp, defaultNow, referencesLazy)
import Drizzle.SQL (raw)
import Drizzle.Schema (Column, Table, columns, notNull, primaryKey, unique, defaultSQL)

-- Indexes and table constraints are defined in the TS schema for drizzle-kit; queries do not need them.

type GoogleDriveDirectoriesCols =
  ( id :: Column Postgres String
  , name :: Column Postgres String
  , path :: Column Postgres String
  , parentId :: Column Postgres (Nullable String)
  , googleDriveId :: Column Postgres String
  , fileId :: Column Postgres String
  , xataVersion :: Column Postgres (Nullable String)
  , createdAt :: Column Postgres JSDate
  , updatedAt :: Column Postgres JSDate
  )

googleDriveDirectories :: Table Postgres GoogleDriveDirectoriesCols
googleDriveDirectories = table "google_drive_directories"
  { id: text "xata_id" # notNull # primaryKey # defaultSQL (raw "xata_id()")
  , name: text "name" # notNull
  , path: text "path" # notNull
  , parentId: text "parent_id" # referencesLazy (\_ -> (columns googleDriveDirectories).id)
  , googleDriveId: text "google_drive_id" # notNull
  , fileId: text "file_id" # notNull # unique
  , xataVersion: text "xata_version"
  , createdAt: timestamp "xata_createdat" # notNull # defaultNow
  , updatedAt: timestamp "xata_updatedat" # notNull # defaultNow
  }

type SelectGoogleDriveDirectories =
  { id :: String
  , name :: String
  , path :: String
  , parentId :: Nullable String
  , googleDriveId :: String
  , fileId :: String
  , xataVersion :: Nullable String
  , createdAt :: JSDate
  , updatedAt :: JSDate
  }
