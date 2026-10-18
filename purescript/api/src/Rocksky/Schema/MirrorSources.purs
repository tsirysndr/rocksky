module Rocksky.Schema.MirrorSources
  ( mirrorSources
  , MirrorSourcesCols
  , SelectMirrorSource
  ) where

import Prelude

import Data.JSDate (JSDate)
import Data.Nullable (Nullable)
import Drizzle.Dialect (Postgres)
import Drizzle.PG.Schema (table, text, integer, boolean, timestamp, defaultNow, references)
import Drizzle.SQL (raw)
import Drizzle.Schema (Column, Table, columns, notNull, primaryKey, withDefault, defaultSQL)
import Rocksky.Schema.Users as Users

-- Indexes and table constraints are defined in the TS schema for drizzle-kit; queries do not need them.

type MirrorSourcesCols =
  ( id :: Column Postgres String
  , userId :: Column Postgres String
  , provider :: Column Postgres String
  , enabled :: Column Postgres Boolean
  , pushEnabled :: Column Postgres (Nullable Boolean)
  , externalUsername :: Column Postgres (Nullable String)
  , encryptedApiKey :: Column Postgres (Nullable String)
  , lastPolledAt :: Column Postgres (Nullable JSDate)
  , lastScrobbleSeenAt :: Column Postgres (Nullable JSDate)
  , createdAt :: Column Postgres JSDate
  , updatedAt :: Column Postgres JSDate
  , xataVersion :: Column Postgres (Nullable Int)
  )

mirrorSources :: Table Postgres MirrorSourcesCols
mirrorSources = table "mirror_sources"
  { id: text "xata_id" # notNull # primaryKey # defaultSQL (raw "xata_id()")
  , userId: text "user_id" # notNull # references (columns Users.users).id
  , provider: text "provider" # notNull
  , enabled: boolean "enabled" # notNull # withDefault false
  -- Rocksky -> the provider. Nullable on purpose: NULL means "never set",
  -- which the API reports as enabled, so existing rows keep pushing without
  -- a backfill. Only teal.fm reads it today.
  , pushEnabled: boolean "push_enabled"
  , externalUsername: text "external_username"
  , encryptedApiKey: text "encrypted_api_key"
  , lastPolledAt: timestamp "last_polled_at"
  , lastScrobbleSeenAt: timestamp "last_scrobble_seen_at"
  , createdAt: timestamp "xata_createdat" # notNull # defaultNow
  , updatedAt: timestamp "xata_updatedat" # notNull # defaultNow
  , xataVersion: integer "xata_version"
  }

type SelectMirrorSource =
  { id :: String
  , userId :: String
  , provider :: String
  , enabled :: Boolean
  , pushEnabled :: Nullable Boolean
  , externalUsername :: Nullable String
  , encryptedApiKey :: Nullable String
  , lastPolledAt :: Nullable JSDate
  , lastScrobbleSeenAt :: Nullable JSDate
  , createdAt :: JSDate
  , updatedAt :: JSDate
  , xataVersion :: Nullable Int
  }
