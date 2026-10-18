module Rocksky.Schema.UserUploads
  ( userUploads
  , UserUploadsCols
  , SelectUserUpload
  ) where

import Prelude

import Data.JSDate (JSDate)
import Data.Nullable (Nullable)
import Drizzle.Dialect (Postgres)
import Drizzle.PG.Schema (table, text, integer, timestamp, defaultNow, references)
import Drizzle.SQL (raw)
import Drizzle.Schema (Column, Table, columns, notNull, primaryKey, defaultSQL)
import Rocksky.Schema.Tracks as Tracks
import Rocksky.Schema.UserStorageProviders as UserStorageProviders
import Rocksky.Schema.Users as Users

-- Indexes and table constraints are defined in the TS schema for drizzle-kit; queries do not need them.

type UserUploadsCols =
  ( id :: Column Postgres String
  , userId :: Column Postgres String
  , trackId :: Column Postgres String
  , r2Key :: Column Postgres String
  , mimeType :: Column Postgres String
  , fileSize :: Column Postgres Int
  , originalFilename :: Column Postgres String
  , sampleRate :: Column Postgres (Nullable Int)
  , storageProviderId :: Column Postgres (Nullable String)
  , uploadedAt :: Column Postgres JSDate
  , createdAt :: Column Postgres JSDate
  , updatedAt :: Column Postgres JSDate
  , xataVersion :: Column Postgres (Nullable Int)
  )

userUploads :: Table Postgres UserUploadsCols
userUploads = table "user_uploads"
  { id: text "xata_id" # notNull # primaryKey # defaultSQL (raw "xata_id()")
  , userId: text "user_id" # notNull # references (columns Users.users).id
  , trackId: text "track_id" # notNull # references (columns Tracks.tracks).id
  , r2Key: text "r2_key" # notNull
  , mimeType: text "mime_type" # notNull
  , fileSize: integer "file_size" # notNull
  , originalFilename: text "original_filename" # notNull
  -- Audio sample rate in Hz (e.g. 44100), probed from the file at upload
  -- time. Nullable: rows uploaded before the column existed.
  , sampleRate: integer "sample_rate"
  , storageProviderId: text "storage_provider_id" # references (columns UserStorageProviders.userStorageProviders).id
  , uploadedAt: timestamp "uploaded_at" # notNull # defaultNow
  , createdAt: timestamp "xata_createdat" # notNull # defaultNow
  , updatedAt: timestamp "xata_updatedat" # notNull # defaultNow
  , xataVersion: integer "xata_version"
  }

type SelectUserUpload =
  { id :: String
  , userId :: String
  , trackId :: String
  , r2Key :: String
  , mimeType :: String
  , fileSize :: Int
  , originalFilename :: String
  , sampleRate :: Nullable Int
  , storageProviderId :: Nullable String
  , uploadedAt :: JSDate
  , createdAt :: JSDate
  , updatedAt :: JSDate
  , xataVersion :: Nullable Int
  }
