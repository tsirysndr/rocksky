module Rocksky.Schema.SpotifyApps
  ( spotifyApps
  , SpotifyAppsCols
  , SelectSpotifyApp
  ) where

import Prelude

import Data.JSDate (JSDate)
import Data.Nullable (Nullable)
import Drizzle.Dialect (Postgres)
import Drizzle.PG.Schema (table, text, integer, timestamp, defaultNow)
import Drizzle.SQL (raw)
import Drizzle.Schema (Column, Table, notNull, primaryKey, unique, defaultSQL)

-- Indexes and table constraints are defined in the TS schema for drizzle-kit; queries do not need them.

type SpotifyAppsCols =
  ( id :: Column Postgres String
  , xataVersion :: Column Postgres (Nullable Int)
  , spotifyAppId :: Column Postgres String
  , spotifySecret :: Column Postgres String
  , createdAt :: Column Postgres JSDate
  , updatedAt :: Column Postgres JSDate
  )

spotifyApps :: Table Postgres SpotifyAppsCols
spotifyApps = table "spotify_apps"
  { id: text "xata_id" # notNull # primaryKey # defaultSQL (raw "xata_id()")
  , xataVersion: integer "xata_version"
  , spotifyAppId: text "spotify_app_id" # notNull # unique
  , spotifySecret: text "spotify_secret" # notNull
  , createdAt: timestamp "xata_createdat" # notNull # defaultNow
  , updatedAt: timestamp "xata_updatedat" # notNull # defaultNow
  }

type SelectSpotifyApp =
  { id :: String
  , xataVersion :: Nullable Int
  , spotifyAppId :: String
  , spotifySecret :: String
  , createdAt :: JSDate
  , updatedAt :: JSDate
  }
