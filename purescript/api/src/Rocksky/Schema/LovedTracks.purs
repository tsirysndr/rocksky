module Rocksky.Schema.LovedTracks
  ( lovedTracks
  , LovedTracksCols
  , SelectLovedTrack
  ) where

import Prelude

import Data.JSDate (JSDate)
import Data.Nullable (Nullable)
import Drizzle.Dialect (Postgres)
import Drizzle.PG.Schema (table, text, timestamp, defaultNow, references)
import Drizzle.SQL (raw)
import Drizzle.Schema (Column, Table, columns, notNull, primaryKey, unique, defaultSQL)
import Rocksky.Schema.Tracks as Tracks
import Rocksky.Schema.Users as Users

-- Indexes and table constraints are defined in the TS schema for drizzle-kit; queries do not need them.

type LovedTracksCols =
  ( id :: Column Postgres String
  , userId :: Column Postgres String
  , trackId :: Column Postgres String
  , uri :: Column Postgres (Nullable String)
  , createdAt :: Column Postgres JSDate
  )

lovedTracks :: Table Postgres LovedTracksCols
lovedTracks = table "loved_tracks"
  { id: text "xata_id" # notNull # primaryKey # defaultSQL (raw "xata_id()")
  , userId: text "user_id" # notNull # references (columns Users.users).id
  , trackId: text "track_id" # notNull # references (columns Tracks.tracks).id
  , uri: text "uri" # unique
  , createdAt: timestamp "xata_createdat" # notNull # defaultNow
  }

type SelectLovedTrack =
  { id :: String
  , userId :: String
  , trackId :: String
  , uri :: Nullable String
  , createdAt :: JSDate
  }
