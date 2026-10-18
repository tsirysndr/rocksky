module Rocksky.Schema.UploadQueueState
  ( uploadQueueState
  , UploadQueueStateCols
  , SelectUploadQueueState
  ) where

import Prelude

import Data.JSDate (JSDate)
import Data.Nullable (Nullable)
import Drizzle.Dialect (Postgres)
import Drizzle.PG.Schema (table, text, integer, timestamp, defaultNow, references)
import Drizzle.SQL (raw)
import Drizzle.Schema (Column, Table, columns, notNull, primaryKey, unique, withDefault, defaultSQL)
import Rocksky.Schema.Users as Users

-- Indexes and table constraints are defined in the TS schema for drizzle-kit; queries do not need them.

type UploadQueueStateCols =
  ( id :: Column Postgres String
  , userId :: Column Postgres String
  , uploadIds :: Column Postgres String
  , currentIndex :: Column Postgres Int
  , createdAt :: Column Postgres JSDate
  , updatedAt :: Column Postgres JSDate
  , xataVersion :: Column Postgres (Nullable Int)
  )

uploadQueueState :: Table Postgres UploadQueueStateCols
uploadQueueState = table "upload_queue_state"
  { id: text "xata_id" # notNull # primaryKey # defaultSQL (raw "xata_id()")
  , userId: text "user_id" # notNull # unique # references (columns Users.users).id
  , uploadIds: text "upload_ids" # notNull # withDefault "[]"
  , currentIndex: integer "current_index" # notNull # withDefault 0
  , createdAt: timestamp "xata_createdat" # notNull # defaultNow
  , updatedAt: timestamp "xata_updatedat" # notNull # defaultNow
  , xataVersion: integer "xata_version"
  }

type SelectUploadQueueState =
  { id :: String
  , userId :: String
  , uploadIds :: String
  , currentIndex :: Int
  , createdAt :: JSDate
  , updatedAt :: JSDate
  , xataVersion :: Nullable Int
  }
