module Rocksky.Schema.UserAlbums
  ( userAlbums
  , UserAlbumsCols
  , SelectUserAlbum
  ) where

import Prelude

import Data.JSDate (JSDate)
import Data.Nullable (Nullable)
import Drizzle.Dialect (Postgres)
import Drizzle.PG.Schema (table, text, integer, timestamp, defaultNow, references)
import Drizzle.SQL (raw)
import Drizzle.Schema (Column, Table, columns, notNull, primaryKey, unique, defaultSQL)
import Rocksky.Schema.Albums as Albums
import Rocksky.Schema.Users as Users

-- Indexes and table constraints are defined in the TS schema for drizzle-kit; queries do not need them.

type UserAlbumsCols =
  ( id :: Column Postgres String
  , userId :: Column Postgres String
  , albumId :: Column Postgres String
  , createdAt :: Column Postgres JSDate
  , updatedAt :: Column Postgres JSDate
  , xataVersion :: Column Postgres (Nullable Int)
  , scrobbles :: Column Postgres (Nullable Int)
  , uri :: Column Postgres String
  )

userAlbums :: Table Postgres UserAlbumsCols
userAlbums = table "user_albums"
  { id: text "xata_id" # notNull # primaryKey # defaultSQL (raw "xata_id()")
  , userId: text "user_id" # notNull # references (columns Users.users).id
  , albumId: text "album_id" # notNull # references (columns Albums.albums).id
  , createdAt: timestamp "xata_createdat" # notNull # defaultNow
  , updatedAt: timestamp "xata_updatedat" # notNull # defaultNow
  , xataVersion: integer "xata_version"
  , scrobbles: integer "scrobbles"
  , uri: text "uri" # notNull # unique
  }

type SelectUserAlbum =
  { id :: String
  , userId :: String
  , albumId :: String
  , createdAt :: JSDate
  , updatedAt :: JSDate
  , xataVersion :: Nullable Int
  , scrobbles :: Nullable Int
  , uri :: String
  }
