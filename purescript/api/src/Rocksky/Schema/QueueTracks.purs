module Rocksky.Schema.QueueTracks
  ( queueTracks
  , QueueTracksCols
  , SelectQueueTrack
  ) where

import Prelude

import Data.JSDate (JSDate)
import Drizzle.Dialect (Postgres)
import Drizzle.PG.Schema (table, text, integer, timestamp, defaultNow, references)
import Drizzle.SQL (raw)
import Drizzle.Schema (Column, Table, columns, notNull, primaryKey, withDefault, defaultSQL)
import Rocksky.Schema.Tracks as Tracks
import Rocksky.Schema.Users as Users

-- Indexes and table constraints are defined in the TS schema for drizzle-kit; queries do not need them.

type QueueTracksCols =
  ( id :: Column Postgres String
  , userId :: Column Postgres String
  , trackId :: Column Postgres String
  , position :: Column Postgres Int
  , fileUri :: Column Postgres String
  , version :: Column Postgres Int
  , createdAt :: Column Postgres JSDate
  , updatedAt :: Column Postgres JSDate
  )

queueTracks :: Table Postgres QueueTracksCols
queueTracks = table "queue_tracks"
  { id: text "xata_id" # notNull # primaryKey # defaultSQL (raw "xata_id()")
  , userId: text "user_id" # notNull # references (columns Users.users).id
  , trackId: text "track_id" # notNull # references (columns Tracks.tracks).id
  , position: integer "position" # notNull
  , fileUri: text "file_uri" # notNull
  , version: integer "xata_version" # notNull # withDefault 0
  , createdAt: timestamp "xata_createdat" # notNull # defaultNow
  , updatedAt: timestamp "xata_updatedat" # notNull # defaultNow
  }

type SelectQueueTrack =
  { id :: String
  , userId :: String
  , trackId :: String
  , position :: Int
  , fileUri :: String
  , version :: Int
  , createdAt :: JSDate
  , updatedAt :: JSDate
  }
