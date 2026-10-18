module Rocksky.Schema.Follows
  ( follows
  , FollowsCols
  , SelectFollows
  ) where

import Prelude

import Data.JSDate (JSDate)
import Data.Nullable (Nullable)
import Drizzle.Dialect (Postgres)
import Drizzle.PG.Schema (table, text, integer, timestamp, defaultNow)
import Drizzle.SQL (raw)
import Drizzle.Schema (Column, Table, notNull, primaryKey, unique, defaultSQL)

-- Indexes and table constraints are defined in the TS schema for drizzle-kit; queries do not need them.

type FollowsCols =
  ( id :: Column Postgres String
  , uri :: Column Postgres String
  , follower_did :: Column Postgres String
  , subject_did :: Column Postgres String
  , xataVersion :: Column Postgres (Nullable Int)
  , createdAt :: Column Postgres JSDate
  , updatedAt :: Column Postgres JSDate
  )

follows :: Table Postgres FollowsCols
follows = table "follows"
  { id: text "xata_id" # notNull # primaryKey # defaultSQL (raw "xata_id()")
  , uri: text "uri" # notNull # unique
  , follower_did: text "follower_did" # notNull
  , subject_did: text "subject_did" # notNull
  , xataVersion: integer "xata_version"
  , createdAt: timestamp "xata_createdat" # notNull # defaultNow
  , updatedAt: timestamp "xata_updatedat" # notNull # defaultNow
  }

type SelectFollows =
  { id :: String
  , uri :: String
  , follower_did :: String
  , subject_did :: String
  , xataVersion :: Nullable Int
  , createdAt :: JSDate
  , updatedAt :: JSDate
  }
