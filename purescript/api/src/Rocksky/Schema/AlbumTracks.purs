module Rocksky.Schema.AlbumTracks
  ( albumTracks
  , AlbumTracksCols
  , SelectAlbumTrack
  ) where

import Prelude

import Data.JSDate (JSDate)
import Data.Nullable (Nullable)
import Drizzle.Dialect (Postgres)
import Drizzle.PG.Schema (table, text, integer, timestamp, defaultNow, references)
import Drizzle.SQL (raw)
import Drizzle.Schema (Column, Table, columns, notNull, primaryKey, defaultSQL)
import Rocksky.Schema.Albums as Albums
import Rocksky.Schema.Tracks as Tracks

-- Indexes and table constraints are defined in the TS schema for drizzle-kit; queries do not need them.

type AlbumTracksCols =
  ( id :: Column Postgres String
  , albumId :: Column Postgres String
  , trackId :: Column Postgres String
  , createdAt :: Column Postgres JSDate
  , updatedAt :: Column Postgres JSDate
  , xataVersion :: Column Postgres (Nullable Int)
  )

albumTracks :: Table Postgres AlbumTracksCols
albumTracks = table "album_tracks"
  { id: text "xata_id" # notNull # primaryKey # defaultSQL (raw "xata_id()")
  , albumId: text "album_id" # notNull # references (columns Albums.albums).id
  , trackId: text "track_id" # notNull # references (columns Tracks.tracks).id
  , createdAt: timestamp "xata_createdat" # notNull # defaultNow
  , updatedAt: timestamp "xata_updatedat" # notNull # defaultNow
  , xataVersion: integer "xata_version"
  }

type SelectAlbumTrack =
  { id :: String
  , albumId :: String
  , trackId :: String
  , createdAt :: JSDate
  , updatedAt :: JSDate
  , xataVersion :: Nullable Int
  }
