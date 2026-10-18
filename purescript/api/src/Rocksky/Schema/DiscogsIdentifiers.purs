module Rocksky.Schema.DiscogsIdentifiers
  ( discogsIdentifiers
  , DiscogsIdentifiersCols
  , SelectDiscogsIdentifier
  ) where

import Prelude

import Data.JSDate (JSDate)
import Data.Nullable (Nullable)
import Drizzle.Dialect (Postgres)
import Drizzle.PG.Schema (table, text, integer, timestamp, defaultNow, references)
import Drizzle.SQL (raw)
import Drizzle.Schema (Column, Table, columns, notNull, primaryKey, defaultSQL)
import Rocksky.Schema.DiscogsReleases as DiscogsReleases

-- Indexes and table constraints are defined in the TS schema for drizzle-kit; queries do not need them.
--
-- Every identifier printed on the release: Barcode, Matrix / Runout, Label
-- Code, Rights Society, ASIN. discogs_releases keeps only the barcode, so this
-- is where a pressing is actually identifiable from.

type DiscogsIdentifiersCols =
  ( id :: Column Postgres String
  , releaseId :: Column Postgres String
  , type :: Column Postgres String
  , value :: Column Postgres (Nullable String)
  , description :: Column Postgres (Nullable String)
  , position :: Column Postgres Int
  , createdAt :: Column Postgres JSDate
  , updatedAt :: Column Postgres JSDate
  , xataVersion :: Column Postgres (Nullable Int)
  )

discogsIdentifiers :: Table Postgres DiscogsIdentifiersCols
discogsIdentifiers = table "discogs_identifiers"
  { id: text "xata_id" # notNull # primaryKey # defaultSQL (raw "xata_id()")
  , releaseId: text "release_id" # notNull # references (columns DiscogsReleases.discogsReleases).id
  , type: text "type" # notNull
  , value: text "value"
  , description: text "description"
  , position: integer "position" # notNull
  , createdAt: timestamp "xata_createdat" # notNull # defaultNow
  , updatedAt: timestamp "xata_updatedat" # notNull # defaultNow
  , xataVersion: integer "xata_version"
  }

type SelectDiscogsIdentifier =
  { id :: String
  , releaseId :: String
  , type :: String
  , value :: Nullable String
  , description :: Nullable String
  , position :: Int
  , createdAt :: JSDate
  , updatedAt :: JSDate
  , xataVersion :: Nullable Int
  }
