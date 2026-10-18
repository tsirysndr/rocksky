module Rocksky.Schema.Playlists
  ( playlists
  , PlaylistsCols
  , SelectPlaylist
  ) where

import Prelude

import Data.JSDate (JSDate)
import Data.Nullable (Nullable)
import Drizzle.Dialect (Postgres)
import Drizzle.PG.Schema (table, text, timestamp, textArray, defaultNow, references)
import Drizzle.SQL (raw)
import Drizzle.Schema (Column, Table, columns, notNull, primaryKey, unique, defaultSQL)
import Rocksky.Schema.Users as Users

-- Indexes and table constraints are defined in the TS schema for drizzle-kit; queries do not need them.

type PlaylistsCols =
  ( id :: Column Postgres String
  , name :: Column Postgres String
  , picture :: Column Postgres (Nullable String)
  , description :: Column Postgres (Nullable String)
  , uri :: Column Postgres (Nullable String)
  , cid :: Column Postgres (Nullable String)
  , collaborators :: Column Postgres (Nullable (Array String))
  , spotifyLink :: Column Postgres (Nullable String)
  , tidalLink :: Column Postgres (Nullable String)
  , appleMusicLink :: Column Postgres (Nullable String)
  , createdBy :: Column Postgres String
  , createdAt :: Column Postgres JSDate
  , updatedAt :: Column Postgres JSDate
  )

playlists :: Table Postgres PlaylistsCols
playlists = table "playlists"
  { id: text "xata_id" # notNull # primaryKey # defaultSQL (raw "xata_id()")
  , name: text "name" # notNull
  , picture: text "picture"
  , description: text "description"
  -- Rows only ever come from a jetstream commit, so every playlist has the
  -- AT-URI and CID of the record it was built from. A CHECK constraint enforces
  -- uri IS NOT NULL for anything written from now on.
  , uri: text "uri" # unique
  , cid: text "cid"
  -- Reserved. Collaborative playlists were pulled before shipping — an entry
  -- record lives in its author's repo, so an owner cannot retract a
  -- collaborator's song, and that needs designing first. Nothing reads or
  -- writes this; kept so re-adding it needs no migration.
  , collaborators: textArray "collaborators"
  , spotifyLink: text "spotify_link"
  , tidalLink: text "tidal_link"
  , appleMusicLink: text "apple_music_link"
  , createdBy: text "created_by" # notNull # references (columns Users.users).id
  , createdAt: timestamp "xata_createdat" # notNull # defaultNow
  , updatedAt: timestamp "xata_updatedat" # notNull # defaultNow
  }

type SelectPlaylist =
  { id :: String
  , name :: String
  , picture :: Nullable String
  , description :: Nullable String
  , uri :: Nullable String
  , cid :: Nullable String
  , collaborators :: Nullable (Array String)
  , spotifyLink :: Nullable String
  , tidalLink :: Nullable String
  , appleMusicLink :: Nullable String
  , createdBy :: String
  , createdAt :: JSDate
  , updatedAt :: JSDate
  }
