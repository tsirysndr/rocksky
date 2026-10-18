module Rocksky.Schema.ArtistAlbums
  ( artistAlbums
  , ArtistAlbumsCols
  , SelectArtistAlbum
  ) where

import Prelude

import Data.JSDate (JSDate)
import Data.Nullable (Nullable)
import Drizzle.Dialect (Postgres)
import Drizzle.PG.Schema (table, text, integer, timestamp, defaultNow, references)
import Drizzle.SQL (raw)
import Drizzle.Schema (Column, Table, columns, notNull, primaryKey, defaultSQL)
import Rocksky.Schema.Albums as Albums
import Rocksky.Schema.Artists as Artists

-- Indexes and table constraints are defined in the TS schema for drizzle-kit; queries do not need them.

type ArtistAlbumsCols =
  ( id :: Column Postgres String
  , artistId :: Column Postgres String
  , albumId :: Column Postgres String
  , createdAt :: Column Postgres JSDate
  , updatedAt :: Column Postgres JSDate
  , xataVersion :: Column Postgres (Nullable Int)
  )

artistAlbums :: Table Postgres ArtistAlbumsCols
artistAlbums = table "artist_albums"
  { id: text "xata_id" # notNull # primaryKey # defaultSQL (raw "xata_id()")
  , artistId: text "artist_id" # notNull # references (columns Artists.artists).id
  , albumId: text "album_id" # notNull # references (columns Albums.albums).id
  , createdAt: timestamp "xata_createdat" # notNull # defaultNow
  , updatedAt: timestamp "xata_updatedat" # notNull # defaultNow
  , xataVersion: integer "xata_version"
  }

type SelectArtistAlbum =
  { id :: String
  , artistId :: String
  , albumId :: String
  , createdAt :: JSDate
  , updatedAt :: JSDate
  , xataVersion :: Nullable Int
  }
