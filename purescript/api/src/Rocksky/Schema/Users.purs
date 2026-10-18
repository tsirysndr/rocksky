module Rocksky.Schema.Users
  ( users
  , UsersCols
  , SelectUser
  ) where

import Prelude

import Data.JSDate (JSDate)
import Data.Nullable (Nullable)
import Drizzle.Dialect (Postgres)
import Drizzle.PG.Schema (table, text, integer, boolean, timestamp, timestampTz, defaultNow)
import Drizzle.SQL (raw)
import Drizzle.Schema (Column, Table, notNull, primaryKey, unique, withDefault, defaultSQL)

-- Indexes and table constraints are defined in the TS schema for drizzle-kit; queries do not need them.

type UsersCols =
  ( id :: Column Postgres String
  , did :: Column Postgres String
  , displayName :: Column Postgres String
  , handle :: Column Postgres String
  , avatar :: Column Postgres String
  , isBot :: Column Postgres Boolean
  , botFlaggedAt :: Column Postgres (Nullable JSDate)
  , botReason :: Column Postgres (Nullable String)
  , createdAt :: Column Postgres JSDate
  , updatedAt :: Column Postgres JSDate
  , xataVersion :: Column Postgres (Nullable Int)
  )

users :: Table Postgres UsersCols
users = table "users"
  { id: text "xata_id" # notNull # primaryKey # defaultSQL (raw "xata_id()")
  , did: text "did" # notNull # unique
  , displayName: text "display_name" # notNull
  , handle: text "handle" # notNull # unique
  , avatar: text "avatar" # notNull
  -- Persistent bot flag, written by the scrobble-abuse-sweep service and
  -- enforced on every scrobble (see lib/scrobbleGuard.ts#assertNotBotFlagged).
  , isBot: boolean "is_bot" # notNull # withDefault false
  , botFlaggedAt: timestampTz "bot_flagged_at"
  , botReason: text "bot_reason"
  , createdAt: timestamp "xata_createdat" # notNull # defaultNow
  , updatedAt: timestamp "xata_updatedat" # notNull # defaultNow
  , xataVersion: integer "xata_version"
  }

type SelectUser =
  { id :: String
  , did :: String
  , displayName :: String
  , handle :: String
  , avatar :: String
  , isBot :: Boolean
  , botFlaggedAt :: Nullable JSDate
  , botReason :: Nullable String
  , createdAt :: JSDate
  , updatedAt :: JSDate
  , xataVersion :: Nullable Int
  }
