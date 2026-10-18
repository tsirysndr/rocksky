module Rocksky.Schema.DiscogsMasters
  ( discogsMasters
  , DiscogsMastersCols
  , SelectDiscogsMaster
  ) where

import Prelude

import Data.JSDate (JSDate)
import Data.Nullable (Nullable)
import Drizzle.Dialect (Postgres)
import Drizzle.PG.Schema (table, text, integer, timestamp, textArray, defaultNow)
import Drizzle.SQL (raw)
import Drizzle.Schema (Column, Table, notNull, primaryKey, unique, defaultSQL)

-- Indexes and table constraints are defined in the TS schema for drizzle-kit; queries do not need them.
--
-- The master groups every edition of a release. Its year is the original one,
-- which is what a reissue's own year is not. Releases point at it by Discogs
-- id rather than by FK: the master is only fetched when it is worth a request
-- out of the quota, so a release may land before its master does.

type DiscogsMastersCols =
  ( id :: Column Postgres String
  , discogsId :: Column Postgres Int
  , title :: Column Postgres String
  , artist :: Column Postgres (Nullable String)
  , year :: Column Postgres (Nullable Int)
  , mainReleaseId :: Column Postgres (Nullable Int)
  , discogsUrl :: Column Postgres (Nullable String)
  , genres :: Column Postgres (Nullable (Array String))
  , styles :: Column Postgres (Nullable (Array String))
  , createdAt :: Column Postgres JSDate
  , updatedAt :: Column Postgres JSDate
  , xataVersion :: Column Postgres (Nullable Int)
  )

discogsMasters :: Table Postgres DiscogsMastersCols
discogsMasters = table "discogs_masters"
  { id: text "xata_id" # notNull # primaryKey # defaultSQL (raw "xata_id()")
  , discogsId: integer "discogs_id" # notNull # unique
  , title: text "title" # notNull
  , artist: text "artist"
  , year: integer "year"
  , mainReleaseId: integer "main_release_id"
  , discogsUrl: text "discogs_url"
  , genres: textArray "genres"
  , styles: textArray "styles"
  , createdAt: timestamp "xata_createdat" # notNull # defaultNow
  , updatedAt: timestamp "xata_updatedat" # notNull # defaultNow
  , xataVersion: integer "xata_version"
  }

type SelectDiscogsMaster =
  { id :: String
  , discogsId :: Int
  , title :: String
  , artist :: Nullable String
  , year :: Nullable Int
  , mainReleaseId :: Nullable Int
  , discogsUrl :: Nullable String
  , genres :: Nullable (Array String)
  , styles :: Nullable (Array String)
  , createdAt :: JSDate
  , updatedAt :: JSDate
  , xataVersion :: Nullable Int
  }
