module Rocksky.Schema.Feeds
  ( feeds
  , FeedsCols
  , SelectFeed
  ) where

import Prelude

import Data.JSDate (JSDate)
import Data.Nullable (Nullable)
import Drizzle.Dialect (Postgres)
import Drizzle.PG.Schema (table, text, integer, timestamp, defaultNow, references)
import Drizzle.SQL (raw)
import Drizzle.Schema (Column, Table, columns, notNull, primaryKey, unique, defaultSQL)
import Rocksky.Schema.Users as Users

-- Indexes and table constraints are defined in the TS schema for drizzle-kit; queries do not need them.

type FeedsCols =
  ( id :: Column Postgres String
  , displayName :: Column Postgres String
  , description :: Column Postgres (Nullable String)
  , did :: Column Postgres String
  , uri :: Column Postgres String
  , avatar :: Column Postgres (Nullable String)
  , userId :: Column Postgres String
  , xataVersion :: Column Postgres (Nullable Int)
  , createdAt :: Column Postgres JSDate
  , updatedAt :: Column Postgres JSDate
  )

feeds :: Table Postgres FeedsCols
feeds = table "feeds"
  { id: text "xata_id" # notNull # primaryKey # defaultSQL (raw "xata_id()")
  , displayName: text "display_name" # notNull
  , description: text "description"
  , did: text "did" # notNull
  , uri: text "uri" # notNull # unique
  , avatar: text "avatar"
  , userId: text "user_id" # notNull # references (columns Users.users).id
  , xataVersion: integer "xata_version"
  , createdAt: timestamp "xata_createdat" # notNull # defaultNow
  , updatedAt: timestamp "xata_updatedat" # notNull # defaultNow
  }

type SelectFeed =
  { id :: String
  , displayName :: String
  , description :: Nullable String
  , did :: String
  , uri :: String
  , avatar :: Nullable String
  , userId :: String
  , xataVersion :: Nullable Int
  , createdAt :: JSDate
  , updatedAt :: JSDate
  }
