module Rocksky.Schema.DropboxAccounts
  ( dropboxAccounts
  , DropboxAccountsCols
  , SelectDropboxAccounts
  ) where

import Prelude

import Data.JSDate (JSDate)
import Data.Nullable (Nullable)
import Drizzle.Dialect (Postgres)
import Drizzle.PG.Schema (table, text, boolean, timestamp, defaultNow, references)
import Drizzle.SQL (raw)
import Drizzle.Schema (Column, Table, columns, notNull, primaryKey, unique, withDefault, defaultSQL)
import Rocksky.Schema.Users as Users

-- Indexes and table constraints are defined in the TS schema for drizzle-kit; queries do not need them.

type DropboxAccountsCols =
  ( id :: Column Postgres String
  , email :: Column Postgres String
  , isBetaUser :: Column Postgres Boolean
  , userId :: Column Postgres String
  , xataVersion :: Column Postgres (Nullable String)
  , createdAt :: Column Postgres JSDate
  , updatedAt :: Column Postgres JSDate
  )

dropboxAccounts :: Table Postgres DropboxAccountsCols
dropboxAccounts = table "dropbox_accounts"
  { id: text "xata_id" # notNull # primaryKey # defaultSQL (raw "xata_id()")
  , email: text "email" # notNull # unique
  , isBetaUser: boolean "is_beta_user" # notNull # withDefault false
  , userId: text "user_id" # notNull # references (columns Users.users).id
  , xataVersion: text "xata_version"
  , createdAt: timestamp "xata_createdat" # notNull # defaultNow
  , updatedAt: timestamp "xata_updatedat" # notNull # defaultNow
  }

type SelectDropboxAccounts =
  { id :: String
  , email :: String
  , isBetaUser :: Boolean
  , userId :: String
  , xataVersion :: Nullable String
  , createdAt :: JSDate
  , updatedAt :: JSDate
  }
