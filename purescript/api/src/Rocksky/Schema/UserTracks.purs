module Rocksky.Schema.UserTracks
  ( userTracks
  , UserTracksCols
  , SelectUserTrack
  ) where

import Prelude

import Data.JSDate (JSDate)
import Data.Nullable (Nullable)
import Drizzle.Dialect (Postgres)
import Drizzle.PG.Schema (table, text, integer, timestamp, defaultNow, references)
import Drizzle.SQL (raw)
import Drizzle.Schema (Column, Table, columns, notNull, primaryKey, unique, defaultSQL)
import Rocksky.Schema.Tracks as Tracks
import Rocksky.Schema.Users as Users

-- Indexes and table constraints are defined in the TS schema for drizzle-kit; queries do not need them.

type UserTracksCols =
  ( id :: Column Postgres String
  , userId :: Column Postgres String
  , trackId :: Column Postgres String
  , createdAt :: Column Postgres JSDate
  , updatedAt :: Column Postgres JSDate
  , xataVersion :: Column Postgres (Nullable Int)
  , uri :: Column Postgres String
  , scrobbles :: Column Postgres (Nullable Int)
  )

userTracks :: Table Postgres UserTracksCols
userTracks = table "user_tracks"
  { id: text "xata_id" # notNull # primaryKey # defaultSQL (raw "xata_id()")
  , userId: text "user_id" # notNull # references (columns Users.users).id
  , trackId: text "track_id" # notNull # references (columns Tracks.tracks).id
  , createdAt: timestamp "xata_createdat" # notNull # defaultNow
  , updatedAt: timestamp "xata_updatedat" # notNull # defaultNow
  , xataVersion: integer "xata_version"
  , uri: text "uri" # notNull # unique
  , scrobbles: integer "scrobbles"
  }

type SelectUserTrack =
  { id :: String
  , userId :: String
  , trackId :: String
  , createdAt :: JSDate
  , updatedAt :: JSDate
  , xataVersion :: Nullable Int
  , uri :: String
  , scrobbles :: Nullable Int
  }
