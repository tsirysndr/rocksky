module Rocksky.Schema.DropboxTokens
  ( dropboxTokens
  , DropboxTokensCols
  , SelectDropboxToken
  ) where

import Prelude

import Data.JSDate (JSDate)
import Drizzle.Dialect (Postgres)
import Drizzle.PG.Schema (table, text, timestamp, defaultNow)
import Drizzle.SQL (raw)
import Drizzle.Schema (Column, Table, notNull, primaryKey, defaultSQL)

-- Indexes and table constraints are defined in the TS schema for drizzle-kit; queries do not need them.

type DropboxTokensCols =
  ( id :: Column Postgres String
  , refreshToken :: Column Postgres String
  , createdAt :: Column Postgres JSDate
  , updatedAt :: Column Postgres JSDate
  )

dropboxTokens :: Table Postgres DropboxTokensCols
dropboxTokens = table "dropbox_tokens"
  { id: text "xata_id" # notNull # primaryKey # defaultSQL (raw "xata_id()")
  , refreshToken: text "refresh_token" # notNull
  , createdAt: timestamp "xata_createdat" # notNull # defaultNow
  , updatedAt: timestamp "xata_updatedat" # notNull # defaultNow
  }

type SelectDropboxToken =
  { id :: String
  , refreshToken :: String
  , createdAt :: JSDate
  , updatedAt :: JSDate
  }
