module Rocksky.Schema.GoogleDrivePaths
  ( googleDrivePaths
  , GoogleDrivePathsCols
  , SelectGoogleDrivePaths
  ) where

import Prelude

import Data.JSDate (JSDate)
import Data.Nullable (Nullable)
import Drizzle.Dialect (Postgres)
import Drizzle.PG.Schema (table, text, timestamp, defaultNow, references)
import Drizzle.SQL (raw)
import Drizzle.Schema (Column, Table, columns, notNull, primaryKey, unique, defaultSQL)
import Rocksky.Schema.GoogleDriveDirectories as GoogleDriveDirectories

-- Indexes and table constraints are defined in the TS schema for drizzle-kit; queries do not need them.

type GoogleDrivePathsCols =
  ( id :: Column Postgres String
  , googleDriveId :: Column Postgres String
  , trackId :: Column Postgres String
  , name :: Column Postgres String
  , directoryId :: Column Postgres (Nullable String)
  , fileId :: Column Postgres String
  , xataVersion :: Column Postgres (Nullable String)
  , createdAt :: Column Postgres JSDate
  , updatedAt :: Column Postgres JSDate
  )

googleDrivePaths :: Table Postgres GoogleDrivePathsCols
googleDrivePaths = table "google_drive_paths"
  { id: text "xata_id" # notNull # primaryKey # defaultSQL (raw "xata_id()")
  , googleDriveId: text "google_drive_id" # notNull
  , trackId: text "track_id" # notNull
  , name: text "name" # notNull
  , directoryId: text "directory_id" # references (columns GoogleDriveDirectories.googleDriveDirectories).id
  , fileId: text "file_id" # notNull # unique
  , xataVersion: text "xata_version"
  , createdAt: timestamp "xata_createdat" # notNull # defaultNow
  , updatedAt: timestamp "xata_updatedat" # notNull # defaultNow
  }

type SelectGoogleDrivePaths =
  { id :: String
  , googleDriveId :: String
  , trackId :: String
  , name :: String
  , directoryId :: Nullable String
  , fileId :: String
  , xataVersion :: Nullable String
  , createdAt :: JSDate
  , updatedAt :: JSDate
  }
