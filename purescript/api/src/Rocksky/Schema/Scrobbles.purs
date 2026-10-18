module Rocksky.Schema.Scrobbles
  ( scrobbles
  , ScrobblesCols
  , SelectScrobble
  ) where

import Prelude

import Data.JSDate (JSDate)
import Data.Nullable (Nullable)
import Drizzle.Dialect (Postgres)
import Drizzle.PG.Schema (table, text, integer, timestamp, defaultNow, references)
import Drizzle.SQL (raw)
import Drizzle.Schema (Column, Table, columns, notNull, primaryKey, unique, defaultSQL)
import Rocksky.Schema.Albums as Albums
import Rocksky.Schema.Artists as Artists
import Rocksky.Schema.Tracks as Tracks
import Rocksky.Schema.Users as Users

-- Indexes and table constraints are defined in the TS schema for drizzle-kit; queries do not need them.

type ScrobblesCols =
  ( id :: Column Postgres String
  , userId :: Column Postgres (Nullable String)
  , trackId :: Column Postgres (Nullable String)
  , albumId :: Column Postgres (Nullable String)
  , artistId :: Column Postgres (Nullable String)
  , uri :: Column Postgres (Nullable String)
  , createdAt :: Column Postgres JSDate
  , updatedAt :: Column Postgres JSDate
  , xataVersion :: Column Postgres (Nullable Int)
  , timestamp :: Column Postgres JSDate
  )

scrobbles :: Table Postgres ScrobblesCols
scrobbles = table "scrobbles"
  { id: text "xata_id" # notNull # primaryKey # defaultSQL (raw "xata_id()")
  , userId: text "user_id" # references (columns Users.users).id
  , trackId: text "track_id" # references (columns Tracks.tracks).id
  , albumId: text "album_id" # references (columns Albums.albums).id
  , artistId: text "artist_id" # references (columns Artists.artists).id
  , uri: text "uri" # unique
  , createdAt: timestamp "xata_createdat" # notNull # defaultNow
  , updatedAt: timestamp "xata_updatedat" # notNull # defaultNow
  , xataVersion: integer "xata_version"
  , timestamp: timestamp "timestamp" # notNull # defaultNow
  }

type SelectScrobble =
  { id :: String
  , userId :: Nullable String
  , trackId :: Nullable String
  , albumId :: Nullable String
  , artistId :: Nullable String
  , uri :: Nullable String
  , createdAt :: JSDate
  , updatedAt :: JSDate
  , xataVersion :: Nullable Int
  , timestamp :: JSDate
  }
