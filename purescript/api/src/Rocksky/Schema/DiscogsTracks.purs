module Rocksky.Schema.DiscogsTracks
  ( discogsTracks
  , DiscogsTracksCols
  , SelectDiscogsTrack
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
-- The release's tracklist as printed. `position` is Discogs' own ("7", "2-04",
-- "C2"); discNumber/trackNumber are the parsed form, and vinyl numbering stays
-- side-relative. Headings and index entries are kept with their `type` so a
-- reader can show the sleeve faithfully or filter to playable tracks.

type DiscogsTracksCols =
  ( id :: Column Postgres String
  , releaseId :: Column Postgres String
  , position :: Column Postgres (Nullable String)
  , type :: Column Postgres (Nullable String)
  , title :: Column Postgres String
  , duration :: Column Postgres (Nullable String)
  , durationMs :: Column Postgres (Nullable Int)
  , discNumber :: Column Postgres (Nullable Int)
  , trackNumber :: Column Postgres (Nullable Int)
  , idx :: Column Postgres Int
  , createdAt :: Column Postgres JSDate
  , updatedAt :: Column Postgres JSDate
  , xataVersion :: Column Postgres (Nullable Int)
  )

discogsTracks :: Table Postgres DiscogsTracksCols
discogsTracks = table "discogs_tracks"
  { id: text "xata_id" # notNull # primaryKey # defaultSQL (raw "xata_id()")
  , releaseId: text "release_id" # notNull # references (columns DiscogsReleases.discogsReleases).id
  , position: text "position"
  , type: text "type"
  , title: text "title" # notNull
  , duration: text "duration"
  , durationMs: integer "duration_ms"
  , discNumber: integer "disc_number"
  , trackNumber: integer "track_number"
  -- Order within the tracklist, since `position` is neither unique nor
  -- sortable across vinyl sides.
  , idx: integer "idx" # notNull
  , createdAt: timestamp "xata_createdat" # notNull # defaultNow
  , updatedAt: timestamp "xata_updatedat" # notNull # defaultNow
  , xataVersion: integer "xata_version"
  }

type SelectDiscogsTrack =
  { id :: String
  , releaseId :: String
  , position :: Nullable String
  , type :: Nullable String
  , title :: String
  , duration :: Nullable String
  , durationMs :: Nullable Int
  , discNumber :: Nullable Int
  , trackNumber :: Nullable Int
  , idx :: Int
  , createdAt :: JSDate
  , updatedAt :: JSDate
  , xataVersion :: Nullable Int
  }
