module Rocksky.Schema.GoogleDrive
  ( googleDrive
  , GoogleDriveCols
  , SelectGoogleDrive
  ) where

import Prelude

import Data.JSDate (JSDate)
import Data.Nullable (Nullable)
import Drizzle.Dialect (Postgres)
import Drizzle.PG.Schema (table, text, timestamp, defaultNow, references)
import Drizzle.SQL (raw)
import Drizzle.Schema (Column, Table, columns, notNull, primaryKey, defaultSQL)
import Rocksky.Schema.GoogleDriveTokens as GoogleDriveTokens
import Rocksky.Schema.Users as Users

-- Indexes and table constraints are defined in the TS schema for drizzle-kit; queries do not need them.

type GoogleDriveCols =
  ( id :: Column Postgres String
  , googleDriveTokenId :: Column Postgres String
  , userId :: Column Postgres String
  , xataVersion :: Column Postgres (Nullable String)
  , createdAt :: Column Postgres JSDate
  , updatedAt :: Column Postgres JSDate
  )

googleDrive :: Table Postgres GoogleDriveCols
googleDrive = table "google_drive"
  { id: text "xata_id" # notNull # primaryKey # defaultSQL (raw "xata_id()")
  , googleDriveTokenId: text "google_drive_token_id" # notNull # references (columns GoogleDriveTokens.googleDriveTokens).id
  , userId: text "user_id" # notNull # references (columns Users.users).id
  , xataVersion: text "xata_version"
  , createdAt: timestamp "xata_createdat" # notNull # defaultNow
  , updatedAt: timestamp "xata_updatedat" # notNull # defaultNow
  }

type SelectGoogleDrive =
  { id :: String
  , googleDriveTokenId :: String
  , userId :: String
  , xataVersion :: Nullable String
  , createdAt :: JSDate
  , updatedAt :: JSDate
  }
