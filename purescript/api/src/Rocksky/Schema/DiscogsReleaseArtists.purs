module Rocksky.Schema.DiscogsReleaseArtists
  ( discogsReleaseArtists
  , DiscogsReleaseArtistsCols
  , SelectDiscogsReleaseArtist
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
-- The artists credited on the release itself, in Discogs' order. joinPhrase is
-- what separates this artist from the next ("Feat.", "&", ","), which is what
-- makes the full credit string rebuildable.

type DiscogsReleaseArtistsCols =
  ( id :: Column Postgres String
  , releaseId :: Column Postgres String
  , artistId :: Column Postgres (Nullable Int)
  , name :: Column Postgres String
  , anv :: Column Postgres (Nullable String)
  , joinPhrase :: Column Postgres (Nullable String)
  , role :: Column Postgres (Nullable String)
  , position :: Column Postgres Int
  , createdAt :: Column Postgres JSDate
  , updatedAt :: Column Postgres JSDate
  , xataVersion :: Column Postgres (Nullable Int)
  )

discogsReleaseArtists :: Table Postgres DiscogsReleaseArtistsCols
discogsReleaseArtists = table "discogs_release_artists"
  { id: text "xata_id" # notNull # primaryKey # defaultSQL (raw "xata_id()")
  , releaseId: text "release_id" # notNull # references (columns DiscogsReleases.discogsReleases).id
  , artistId: integer "artist_id"
  , name: text "name" # notNull
  -- The name as credited on this release, when it differs.
  , anv: text "anv"
  , joinPhrase: text "join_phrase"
  , role: text "role"
  , position: integer "position" # notNull
  , createdAt: timestamp "xata_createdat" # notNull # defaultNow
  , updatedAt: timestamp "xata_updatedat" # notNull # defaultNow
  , xataVersion: integer "xata_version"
  }

type SelectDiscogsReleaseArtist =
  { id :: String
  , releaseId :: String
  , artistId :: Nullable Int
  , name :: String
  , anv :: Nullable String
  , joinPhrase :: Nullable String
  , role :: Nullable String
  , position :: Int
  , createdAt :: JSDate
  , updatedAt :: JSDate
  , xataVersion :: Nullable Int
  }
