module Rocksky.Schema.ArtistTracks
  ( artistTracks
  , ArtistTracksCols
  , SelectArtistTrack
  ) where

import Prelude

import Data.JSDate (JSDate)
import Data.Nullable (Nullable)
import Drizzle.Dialect (Postgres)
import Drizzle.PG.Schema (table, text, integer, timestamp, defaultNow, references)
import Drizzle.SQL (raw)
import Drizzle.Schema (Column, Table, columns, notNull, primaryKey, defaultSQL)
import Rocksky.Schema.Artists as Artists
import Rocksky.Schema.Tracks as Tracks

-- Indexes and table constraints are defined in the TS schema for drizzle-kit; queries do not need them.

type ArtistTracksCols =
  ( id :: Column Postgres String
  , artistId :: Column Postgres String
  , trackId :: Column Postgres String
  , createdAt :: Column Postgres JSDate
  , updatedAt :: Column Postgres JSDate
  , xataVersion :: Column Postgres (Nullable Int)
  )

artistTracks :: Table Postgres ArtistTracksCols
artistTracks = table "artist_tracks"
  { id: text "xata_id" # notNull # primaryKey # defaultSQL (raw "xata_id()")
  , artistId: text "artist_id" # notNull # references (columns Artists.artists).id
  , trackId: text "track_id" # notNull # references (columns Tracks.tracks).id
  , createdAt: timestamp "xata_createdat" # notNull # defaultNow
  , updatedAt: timestamp "xata_updatedat" # notNull # defaultNow
  , xataVersion: integer "xata_version"
  }

type SelectArtistTrack =
  { id :: String
  , artistId :: String
  , trackId :: String
  , createdAt :: JSDate
  , updatedAt :: JSDate
  , xataVersion :: Nullable Int
  }
