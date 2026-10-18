module Rocksky.Schema.DiscogsReleaseLabels
  ( discogsReleaseLabels
  , DiscogsReleaseLabelsCols
  , SelectDiscogsReleaseLabel
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
-- Labels and companies share one table because Discogs gives them the same
-- shape; `kind` says which list an entry came from. Companies are the
-- "Pressed By" / "Distributed By" / "Phonographic Copyright (p)" entries,
-- which is why entity_type is worth keeping.

type DiscogsReleaseLabelsCols =
  ( id :: Column Postgres String
  , releaseId :: Column Postgres String
  , labelId :: Column Postgres (Nullable Int)
  , name :: Column Postgres String
  , catalogNumber :: Column Postgres (Nullable String)
  , kind :: Column Postgres String
  , entityType :: Column Postgres (Nullable String)
  , position :: Column Postgres Int
  , createdAt :: Column Postgres JSDate
  , updatedAt :: Column Postgres JSDate
  , xataVersion :: Column Postgres (Nullable Int)
  )

discogsReleaseLabels :: Table Postgres DiscogsReleaseLabelsCols
discogsReleaseLabels = table "discogs_release_labels"
  { id: text "xata_id" # notNull # primaryKey # defaultSQL (raw "xata_id()")
  , releaseId: text "release_id" # notNull # references (columns DiscogsReleases.discogsReleases).id
  , labelId: integer "label_id"
  , name: text "name" # notNull
  , catalogNumber: text "catalog_number"
  , kind: text "kind" # notNull
  , entityType: text "entity_type"
  , position: integer "position" # notNull
  , createdAt: timestamp "xata_createdat" # notNull # defaultNow
  , updatedAt: timestamp "xata_updatedat" # notNull # defaultNow
  , xataVersion: integer "xata_version"
  }

type SelectDiscogsReleaseLabel =
  { id :: String
  , releaseId :: String
  , labelId :: Nullable Int
  , name :: String
  , catalogNumber :: Nullable String
  , kind :: String
  , entityType :: Nullable String
  , position :: Int
  , createdAt :: JSDate
  , updatedAt :: JSDate
  , xataVersion :: Nullable Int
  }
