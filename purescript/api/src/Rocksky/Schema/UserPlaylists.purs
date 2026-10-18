module Rocksky.Schema.UserPlaylists
  ( userPlaylists
  , UserPlaylistsCols
  , SelectUserPlaylist
  ) where

import Prelude

import Data.JSDate (JSDate)
import Data.Nullable (Nullable)
import Drizzle.Dialect (Postgres)
import Drizzle.PG.Schema (table, text, timestamp, defaultNow, references)
import Drizzle.SQL (raw)
import Drizzle.Schema (Column, Table, columns, notNull, primaryKey, unique, defaultSQL)
import Rocksky.Schema.Playlists as Playlists
import Rocksky.Schema.Users as Users

-- Indexes and table constraints are defined in the TS schema for drizzle-kit; queries do not need them.

type UserPlaylistsCols =
  ( id :: Column Postgres String
  , userId :: Column Postgres String
  , playlistId :: Column Postgres String
  , createdAt :: Column Postgres JSDate
  , uri :: Column Postgres (Nullable String)
  )

userPlaylists :: Table Postgres UserPlaylistsCols
userPlaylists = table "user_playlists"
  { id: text "xata_id" # notNull # primaryKey # defaultSQL (raw "xata_id()")
  , userId: text "user_id" # notNull # references (columns Users.users).id
  , playlistId: text "playlist_id" # notNull # references (columns Playlists.playlists).id
  , createdAt: timestamp "xata_createdat" # notNull # defaultNow
  , uri: text "uri" # unique
  }

type SelectUserPlaylist =
  { id :: String
  , userId :: String
  , playlistId :: String
  , createdAt :: JSDate
  , uri :: Nullable String
  }
