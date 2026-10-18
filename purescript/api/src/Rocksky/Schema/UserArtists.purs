module Rocksky.Schema.UserArtists
  ( userArtists
  , UserArtistsCols
  , SelectUserArtist
  ) where

import Prelude

import Data.JSDate (JSDate)
import Data.Nullable (Nullable)
import Drizzle.Dialect (Postgres)
import Drizzle.PG.Schema (table, text, integer, timestamp, defaultNow, references)
import Drizzle.SQL (raw)
import Drizzle.Schema (Column, Table, columns, notNull, primaryKey, unique, defaultSQL)
import Rocksky.Schema.Artists as Artists
import Rocksky.Schema.Users as Users

-- Indexes and table constraints are defined in the TS schema for drizzle-kit; queries do not need them.

type UserArtistsCols =
  ( id :: Column Postgres String
  , userId :: Column Postgres String
  , artistId :: Column Postgres String
  , createdAt :: Column Postgres JSDate
  , updatedAt :: Column Postgres JSDate
  , xataVersion :: Column Postgres (Nullable Int)
  , scrobbles :: Column Postgres (Nullable Int)
  , uri :: Column Postgres (Nullable String)
  )

userArtists :: Table Postgres UserArtistsCols
userArtists = table "user_artists"
  { id: text "xata_id" # notNull # primaryKey # defaultSQL (raw "xata_id()")
  , userId: text "user_id" # notNull # references (columns Users.users).id
  , artistId: text "artist_id" # notNull # references (columns Artists.artists).id
  , createdAt: timestamp "xata_createdat" # notNull # defaultNow
  , updatedAt: timestamp "xata_updatedat" # notNull # defaultNow
  , xataVersion: integer "xata_version"
  , scrobbles: integer "scrobbles"
  , uri: text "uri" # unique
  }

type SelectUserArtist =
  { id :: String
  , userId :: String
  , artistId :: String
  , createdAt :: JSDate
  , updatedAt :: JSDate
  , xataVersion :: Nullable Int
  , scrobbles :: Nullable Int
  , uri :: Nullable String
  }
