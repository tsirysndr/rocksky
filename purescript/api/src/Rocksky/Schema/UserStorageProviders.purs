module Rocksky.Schema.UserStorageProviders
  ( userStorageProviders
  , UserStorageProvidersCols
  , SelectUserStorageProvider
  ) where

import Prelude

import Data.JSDate (JSDate)
import Data.Nullable (Nullable)
import Drizzle.Dialect (Postgres)
import Drizzle.PG.Schema (table, text, integer, timestamp, defaultNow, references)
import Drizzle.SQL (raw)
import Drizzle.Schema (Column, Table, columns, notNull, primaryKey, withDefault, defaultSQL)
import Rocksky.Schema.Users as Users

-- Indexes and table constraints are defined in the TS schema for drizzle-kit; queries do not need them.

type UserStorageProvidersCols =
  ( id :: Column Postgres String
  , userId :: Column Postgres String
  , label :: Column Postgres String
  , endpoint :: Column Postgres String
  , region :: Column Postgres String
  , bucket :: Column Postgres String
  , accessKey :: Column Postgres String
  , secretKey :: Column Postgres String
  , publicUrl :: Column Postgres (Nullable String)
  , verifiedAt :: Column Postgres (Nullable JSDate)
  , createdAt :: Column Postgres JSDate
  , updatedAt :: Column Postgres JSDate
  , xataVersion :: Column Postgres (Nullable Int)
  )

userStorageProviders :: Table Postgres UserStorageProvidersCols
userStorageProviders = table "user_storage_providers"
  { id: text "xata_id" # notNull # primaryKey # defaultSQL (raw "xata_id()")
  , userId: text "user_id" # notNull # references (columns Users.users).id
  , label: text "label" # notNull
  , endpoint: text "endpoint" # notNull
  , region: text "region" # notNull # withDefault "auto"
  , bucket: text "bucket" # notNull
  , accessKey: text "access_key" # notNull
  , secretKey: text "secret_key" # notNull
  , publicUrl: text "public_url"
  , verifiedAt: timestamp "verified_at"
  , createdAt: timestamp "xata_createdat" # notNull # defaultNow
  , updatedAt: timestamp "xata_updatedat" # notNull # defaultNow
  , xataVersion: integer "xata_version"
  }

type SelectUserStorageProvider =
  { id :: String
  , userId :: String
  , label :: String
  , endpoint :: String
  , region :: String
  , bucket :: String
  , accessKey :: String
  , secretKey :: String
  , publicUrl :: Nullable String
  , verifiedAt :: Nullable JSDate
  , createdAt :: JSDate
  , updatedAt :: JSDate
  , xataVersion :: Nullable Int
  }
