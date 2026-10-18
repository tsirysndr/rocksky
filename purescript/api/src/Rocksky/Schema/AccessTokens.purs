module Rocksky.Schema.AccessTokens
  ( accessTokens
  , AccessTokensCols
  , SelectAccessToken
  ) where

import Prelude

import Data.JSDate (JSDate)
import Data.Nullable (Nullable)
import Drizzle.Dialect (Postgres)
import Drizzle.PG.Schema (table, text, timestamp, defaultNow, references)
import Drizzle.SQL (raw)
import Drizzle.Schema (Column, Table, columns, notNull, primaryKey, unique, defaultSQL)
import Rocksky.Schema.Users as Users

-- Indexes and table constraints are defined in the TS schema for drizzle-kit; queries do not need them.

type AccessTokensCols =
  ( id :: Column Postgres String
  , userId :: Column Postgres String
  , name :: Column Postgres String
  , jti :: Column Postgres String
  , tokenEncrypted :: Column Postgres String
  , lastFour :: Column Postgres String
  , lastUsedAt :: Column Postgres (Nullable JSDate)
  , createdAt :: Column Postgres JSDate
  , updatedAt :: Column Postgres JSDate
  )

accessTokens :: Table Postgres AccessTokensCols
accessTokens = table "access_tokens"
  { id: text "xata_id" # notNull # primaryKey # defaultSQL (raw "xata_id()")
  , userId: text "user_id" # notNull # references (columns Users.users).id
  , name: text "name" # notNull
  , jti: text "jti" # notNull # unique
  , tokenEncrypted: text "token_encrypted" # notNull
  , lastFour: text "last_four" # notNull
  , lastUsedAt: timestamp "last_used_at"
  , createdAt: timestamp "xata_createdat" # notNull # defaultNow
  , updatedAt: timestamp "xata_updatedat" # notNull # defaultNow
  }

type SelectAccessToken =
  { id :: String
  , userId :: String
  , name :: String
  , jti :: String
  , tokenEncrypted :: String
  , lastFour :: String
  , lastUsedAt :: Nullable JSDate
  , createdAt :: JSDate
  , updatedAt :: JSDate
  }
