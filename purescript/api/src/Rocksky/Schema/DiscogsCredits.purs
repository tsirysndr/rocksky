module Rocksky.Schema.DiscogsCredits
  ( discogsCredits
  , DiscogsCreditsCols
  , SelectDiscogsCredit
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
-- Performance and production credits for a release: Discogs' extraartists,
-- plus the matched track's own. Rewritten wholesale whenever the release is
-- re-fetched, so `position` is just the order Discogs listed them in.

type DiscogsCreditsCols =
  ( id :: Column Postgres String
  , releaseId :: Column Postgres String
  , artistId :: Column Postgres (Nullable Int)
  , name :: Column Postgres String
  , role :: Column Postgres (Nullable String)
  , tracks :: Column Postgres (Nullable String)
  , position :: Column Postgres Int
  , createdAt :: Column Postgres JSDate
  , updatedAt :: Column Postgres JSDate
  , xataVersion :: Column Postgres (Nullable Int)
  )

discogsCredits :: Table Postgres DiscogsCreditsCols
discogsCredits = table "discogs_credits"
  { id: text "xata_id" # notNull # primaryKey # defaultSQL (raw "xata_id()")
  , releaseId: text "release_id" # notNull # references (columns DiscogsReleases.discogsReleases).id
  , artistId: integer "artist_id"
  , name: text "name" # notNull
  -- Discogs' own wording: "Written-By", "Mixed By, Engineer".
  , role: text "role"
  -- Track positions the credit applies to, null when it covers the release.
  , tracks: text "tracks"
  , position: integer "position" # notNull
  , createdAt: timestamp "xata_createdat" # notNull # defaultNow
  , updatedAt: timestamp "xata_updatedat" # notNull # defaultNow
  , xataVersion: integer "xata_version"
  }

type SelectDiscogsCredit =
  { id :: String
  , releaseId :: String
  , artistId :: Nullable Int
  , name :: String
  , role :: Nullable String
  , tracks :: Nullable String
  , position :: Int
  , createdAt :: JSDate
  , updatedAt :: JSDate
  , xataVersion :: Nullable Int
  }
