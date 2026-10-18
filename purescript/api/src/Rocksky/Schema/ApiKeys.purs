module Rocksky.Schema.ApiKeys
  ( apiKeys
  , ApiKeysCols
  , SelectApiKey
  ) where

import Prelude

import Data.JSDate (JSDate)
import Data.Nullable (Nullable)
import Drizzle.Dialect (Postgres)
import Drizzle.PG.Schema (table, text, boolean, timestamp, defaultNow, references)
import Drizzle.SQL (raw)
import Drizzle.Schema (Column, Table, columns, notNull, primaryKey, withDefault, defaultSQL)
import Rocksky.Schema.Users as Users

-- Indexes and table constraints are defined in the TS schema for drizzle-kit; queries do not need them.

type ApiKeysCols =
  ( id :: Column Postgres String
  , name :: Column Postgres String
  , apiKey :: Column Postgres String
  , sharedSecret :: Column Postgres String
  , description :: Column Postgres (Nullable String)
  , enabled :: Column Postgres Boolean
  , userId :: Column Postgres String
  , createdAt :: Column Postgres JSDate
  , updatedAt :: Column Postgres JSDate
  )

apiKeys :: Table Postgres ApiKeysCols
apiKeys = table "api_keys"
  { id: text "xata_id" # notNull # primaryKey # defaultSQL (raw "xata_id()")
  , name: text "name" # notNull
  , apiKey: text "api_key" # notNull
  , sharedSecret: text "shared_secret" # notNull
  , description: text "description"
  , enabled: boolean "enabled" # notNull # withDefault true
  , userId: text "user_id" # notNull # references (columns Users.users).id
  , createdAt: timestamp "xata_createdat" # notNull # defaultNow
  , updatedAt: timestamp "xata_updatedat" # notNull # defaultNow
  }

type SelectApiKey =
  { id :: String
  , name :: String
  , apiKey :: String
  , sharedSecret :: String
  , description :: Nullable String
  , enabled :: Boolean
  , userId :: String
  , createdAt :: JSDate
  , updatedAt :: JSDate
  }
