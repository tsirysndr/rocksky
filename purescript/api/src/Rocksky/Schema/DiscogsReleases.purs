module Rocksky.Schema.DiscogsReleases
  ( discogsReleases
  , DiscogsReleasesCols
  , SelectDiscogsRelease
  ) where

import Prelude

import Data.JSDate (JSDate)
import Data.Nullable (Nullable)
import Drizzle.Dialect (Postgres)
import Drizzle.PG.Schema (table, text, integer, real, timestamp, textArray, defaultNow)
import Drizzle.SQL (raw)
import Drizzle.Schema (Column, Table, notNull, primaryKey, unique, defaultSQL)

-- Indexes and table constraints are defined in the TS schema for drizzle-kit; queries do not need them.

type DiscogsReleasesCols =
  ( id :: Column Postgres String
  , discogsId :: Column Postgres Int
  , masterId :: Column Postgres (Nullable Int)
  , title :: Column Postgres String
  , artist :: Column Postgres String
  , albumArt :: Column Postgres (Nullable String)
  , year :: Column Postgres (Nullable Int)
  , originalYear :: Column Postgres (Nullable Int)
  , releaseDate :: Column Postgres (Nullable String)
  , country :: Column Postgres (Nullable String)
  , label :: Column Postgres (Nullable String)
  , catalogNumber :: Column Postgres (Nullable String)
  , barcode :: Column Postgres (Nullable String)
  , formats :: Column Postgres (Nullable (Array String))
  , genres :: Column Postgres (Nullable (Array String))
  , styles :: Column Postgres (Nullable (Array String))
  , discogsUrl :: Column Postgres (Nullable String)
  , score :: Column Postgres (Nullable Number)
  , creditsFetchedAt :: Column Postgres (Nullable JSDate)
  , createdAt :: Column Postgres JSDate
  , updatedAt :: Column Postgres JSDate
  , xataVersion :: Column Postgres (Nullable Int)
  )

discogsReleases :: Table Postgres DiscogsReleasesCols
discogsReleases = table "discogs_releases"
  { id: text "xata_id" # notNull # primaryKey # defaultSQL (raw "xata_id()")
  , discogsId: integer "discogs_id" # notNull # unique
  , masterId: integer "master_id"
  , title: text "title" # notNull
  , artist: text "artist" # notNull
  , albumArt: text "album_art"
  , year: integer "year"
  -- The master's year: the original release, not this pressing.
  , originalYear: integer "original_year"
  , releaseDate: text "release_date"
  , country: text "country"
  , label: text "label"
  , catalogNumber: text "catalog_number"
  , barcode: text "barcode"
  , formats: textArray "formats"
  , genres: textArray "genres"
  , styles: textArray "styles"
  , discogsUrl: text "discogs_url"
  -- Confidence of the match that produced this row, from the service.
  , score: real "score"
  -- Null means credits were never fetched for this release, which is what
  -- lets a release stored before credits existed be filled in later. It is
  -- not the same as a release that genuinely has none.
  , creditsFetchedAt: timestamp "credits_fetched_at"
  , createdAt: timestamp "xata_createdat" # notNull # defaultNow
  , updatedAt: timestamp "xata_updatedat" # notNull # defaultNow
  , xataVersion: integer "xata_version"
  }

type SelectDiscogsRelease =
  { id :: String
  , discogsId :: Int
  , masterId :: Nullable Int
  , title :: String
  , artist :: String
  , albumArt :: Nullable String
  , year :: Nullable Int
  , originalYear :: Nullable Int
  , releaseDate :: Nullable String
  , country :: Nullable String
  , label :: Nullable String
  , catalogNumber :: Nullable String
  , barcode :: Nullable String
  , formats :: Nullable (Array String)
  , genres :: Nullable (Array String)
  , styles :: Nullable (Array String)
  , discogsUrl :: Nullable String
  , score :: Nullable Number
  , creditsFetchedAt :: Nullable JSDate
  , createdAt :: JSDate
  , updatedAt :: JSDate
  , xataVersion :: Nullable Int
  }
