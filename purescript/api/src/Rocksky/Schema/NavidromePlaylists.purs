module Rocksky.Schema.NavidromePlaylists
  ( navidromePlaylists
  , NavidromePlaylistsCols
  , SelectNavidromePlaylist
  ) where

import Prelude

import Data.JSDate (JSDate)
import Data.Nullable (Nullable)
import Drizzle.Dialect (Postgres)
import Drizzle.PG.Schema (table, text, timestampTz, defaultNow, references)
import Drizzle.SQL (raw)
import Drizzle.Schema (Column, Table, columns, notNull, primaryKey, unique, defaultSQL)
import Rocksky.Schema.Users as Users

-- Indexes and table constraints are defined in the TS schema for drizzle-kit; queries do not need them.
--
-- Playlists created through the Navidrome (Subsonic-compatible) API. Kept in a
-- dedicated table so they are isolated from playlists ingested from other
-- sources (atproto records, Spotify imports, …).

type NavidromePlaylistsCols =
  ( id :: Column Postgres String
  , name :: Column Postgres String
  , description :: Column Postgres (Nullable String)
  , uri :: Column Postgres (Nullable String)
  , userId :: Column Postgres String
  , createdAt :: Column Postgres JSDate
  , updatedAt :: Column Postgres JSDate
  )

navidromePlaylists :: Table Postgres NavidromePlaylistsCols
navidromePlaylists = table "navidrome_playlists"
  { id: text "xata_id" # notNull # primaryKey # defaultSQL (raw "xata_id()")
  , name: text "name" # notNull
  , description: text "description"
  -- AT-URI of the app.rocksky.playlist record this row is mirrored to. NULL
  -- for playlists that predate the mirror; it publishes one on first mutation.
  , uri: text "uri" # unique
  , userId: text "user_id" # notNull # references (columns Users.users).id
  , createdAt: timestampTz "xata_createdat" # notNull # defaultNow
  , updatedAt: timestampTz "xata_updatedat" # notNull # defaultNow
  }

type SelectNavidromePlaylist =
  { id :: String
  , name :: String
  , description :: Nullable String
  , uri :: Nullable String
  , userId :: String
  , createdAt :: JSDate
  , updatedAt :: JSDate
  }
