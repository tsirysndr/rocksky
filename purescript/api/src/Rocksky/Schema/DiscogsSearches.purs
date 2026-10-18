module Rocksky.Schema.DiscogsSearches
  ( discogsSearches
  , DiscogsSearchesCols
  , SelectDiscogsSearch
  ) where

import Prelude

import Data.JSDate (JSDate)
import Data.Nullable (Nullable)
import Drizzle.Dialect (Postgres)
import Drizzle.PG.Schema (table, text, integer, real, timestamp, defaultNow, references)
import Drizzle.SQL (raw)
import Drizzle.Schema (Column, Table, columns, notNull, primaryKey, unique, defaultSQL)
import Rocksky.Schema.DiscogsReleases as DiscogsReleases

-- Indexes and table constraints are defined in the TS schema for drizzle-kit; queries do not need them.
--
-- One row per artist+album we have asked Discogs about. Scrobbles repeat
-- endlessly, so this is what keeps a replayed album off the 60-requests-per-
-- minute quota. A null release_id is a recorded miss, retried once it goes
-- stale (see isStaleSearch).

type DiscogsSearchesCols =
  ( id :: Column Postgres String
  , sha256 :: Column Postgres String
  , artist :: Column Postgres String
  , album :: Column Postgres String
  , releaseId :: Column Postgres (Nullable String)
  , score :: Column Postgres (Nullable Number)
  , searchedAt :: Column Postgres JSDate
  , createdAt :: Column Postgres JSDate
  , updatedAt :: Column Postgres JSDate
  , xataVersion :: Column Postgres (Nullable Int)
  )

discogsSearches :: Table Postgres DiscogsSearchesCols
discogsSearches = table "discogs_searches"
  { id: text "xata_id" # notNull # primaryKey # defaultSQL (raw "xata_id()")
  , sha256: text "sha256" # notNull # unique
  , artist: text "artist" # notNull
  , album: text "album" # notNull
  , releaseId: text "release_id" # references (columns DiscogsReleases.discogsReleases).id
  , score: real "score"
  , searchedAt: timestamp "searched_at" # notNull # defaultNow
  , createdAt: timestamp "xata_createdat" # notNull # defaultNow
  , updatedAt: timestamp "xata_updatedat" # notNull # defaultNow
  , xataVersion: integer "xata_version"
  }

type SelectDiscogsSearch =
  { id :: String
  , sha256 :: String
  , artist :: String
  , album :: String
  , releaseId :: Nullable String
  , score :: Nullable Number
  , searchedAt :: JSDate
  , createdAt :: JSDate
  , updatedAt :: JSDate
  , xataVersion :: Nullable Int
  }
