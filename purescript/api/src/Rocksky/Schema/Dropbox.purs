module Rocksky.Schema.Dropbox
  ( dropbox
  , DropboxCols
  , SelectDropbox
  ) where

import Prelude

import Data.JSDate (JSDate)
import Data.Nullable (Nullable)
import Drizzle.Dialect (Postgres)
import Drizzle.PG.Schema (table, text, timestamp, defaultNow, references)
import Drizzle.SQL (raw)
import Drizzle.Schema (Column, Table, columns, notNull, primaryKey, defaultSQL)
import Rocksky.Schema.DropboxTokens as DropboxTokens
import Rocksky.Schema.Users as Users

-- Indexes and table constraints are defined in the TS schema for drizzle-kit; queries do not need them.

type DropboxCols =
  ( id :: Column Postgres String
  , userId :: Column Postgres String
  , dropboxTokenId :: Column Postgres String
  , xataVersion :: Column Postgres (Nullable String)
  , createdAt :: Column Postgres JSDate
  , updatedAt :: Column Postgres JSDate
  )

dropbox :: Table Postgres DropboxCols
dropbox = table "dropbox"
  { id: text "xata_id" # notNull # primaryKey # defaultSQL (raw "xata_id()")
  , userId: text "user_id" # notNull # references (columns Users.users).id
  , dropboxTokenId: text "dropbox_token_id" # notNull # references (columns DropboxTokens.dropboxTokens).id
  , xataVersion: text "xata_version"
  , createdAt: timestamp "xata_createdat" # notNull # defaultNow
  , updatedAt: timestamp "xata_updatedat" # notNull # defaultNow
  }

type SelectDropbox =
  { id :: String
  , userId :: String
  , dropboxTokenId :: String
  , xataVersion :: Nullable String
  , createdAt :: JSDate
  , updatedAt :: JSDate
  }
