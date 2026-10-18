module Rocksky.Schema.PlaylistTracks
  ( playlistTracks
  , PlaylistTracksCols
  , SelectPlaylistTrack
  ) where

import Prelude

import Data.JSDate (JSDate)
import Data.Nullable (Nullable)
import Drizzle.Dialect (Postgres)
import Drizzle.PG.Schema (table, text, timestamp, timestampTz, defaultNow, references)
import Drizzle.SQL (raw)
import Drizzle.Schema (Column, Table, columns, notNull, primaryKey, unique, defaultSQL)
import Rocksky.Schema.Playlists as Playlists
import Rocksky.Schema.Tracks as Tracks
import Rocksky.Schema.Users as Users

-- Indexes and table constraints are defined in the TS schema for drizzle-kit; queries do not need them.

type PlaylistTracksCols =
  ( id :: Column Postgres String
  , playlistId :: Column Postgres String
  , trackId :: Column Postgres String
  , uri :: Column Postgres (Nullable String)
  , cid :: Column Postgres (Nullable String)
  , addedBy :: Column Postgres (Nullable String)
  , addedAt :: Column Postgres (Nullable JSDate)
  , createdAt :: Column Postgres JSDate
  )

playlistTracks :: Table Postgres PlaylistTracksCols
playlistTracks = table "playlist_tracks"
  { id: text "xata_id" # notNull # primaryKey # defaultSQL (raw "xata_id()")
  , playlistId: text "playlist_id" # notNull # references (columns Playlists.playlists).id
  , trackId: text "track_id" # notNull # references (columns Tracks.tracks).id
  -- AT-URI and CID of the app.rocksky.playlist.song record this row mirrors.
  -- The URI is the sync key: ingest upserts on it and deletes by it, so a row
  -- cannot exist without a record behind it.
  , uri: text "uri" # unique
  , cid: text "cid"
  -- The repo that authored the entry — always the playlist owner today.
  , addedBy: text "added_by" # references (columns Users.users).id
  -- `addedAt` from the record, which is what the playlist is ordered by.
  -- Distinct from createdAt, which is when we happened to ingest it.
  , addedAt: timestampTz "added_at"
  , createdAt: timestamp "xata_createdat" # notNull # defaultNow
  }

type SelectPlaylistTrack =
  { id :: String
  , playlistId :: String
  , trackId :: String
  , uri :: Nullable String
  , cid :: Nullable String
  , addedBy :: Nullable String
  , addedAt :: Nullable JSDate
  , createdAt :: JSDate
  }
