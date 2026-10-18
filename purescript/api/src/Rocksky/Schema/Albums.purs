module Rocksky.Schema.Albums
  ( albums
  , AlbumsCols
  , SelectAlbum
  ) where

import Prelude

import Data.JSDate (JSDate)
import Data.Nullable (Nullable)
import Drizzle.Dialect (Postgres)
import Drizzle.PG.Schema (table, text, integer, timestamp, defaultNow, references)
import Drizzle.SQL (raw)
import Drizzle.Schema (Column, Table, columns, notNull, primaryKey, unique, defaultSQL)
import Rocksky.Schema.DiscogsReleases as DiscogsReleases

-- Indexes and table constraints are defined in the TS schema for drizzle-kit; queries do not need them.

type AlbumsCols =
  ( id :: Column Postgres String
  , title :: Column Postgres String
  , artist :: Column Postgres String
  , releaseDate :: Column Postgres (Nullable String)
  , year :: Column Postgres (Nullable Int)
  , albumArt :: Column Postgres (Nullable String)
  , uri :: Column Postgres (Nullable String)
  , artistUri :: Column Postgres (Nullable String)
  , appleMusicLink :: Column Postgres (Nullable String)
  , spotifyLink :: Column Postgres (Nullable String)
  , tidalLink :: Column Postgres (Nullable String)
  , youtubeLink :: Column Postgres (Nullable String)
  , sha256 :: Column Postgres String
  , discogsReleaseId :: Column Postgres (Nullable String)
  , createdAt :: Column Postgres JSDate
  , updatedAt :: Column Postgres JSDate
  , xataVersion :: Column Postgres (Nullable Int)
  )

albums :: Table Postgres AlbumsCols
albums = table "albums"
  { id: text "xata_id" # notNull # primaryKey # defaultSQL (raw "xata_id()")
  , title: text "title" # notNull
  , artist: text "artist" # notNull
  , releaseDate: text "release_date"
  , year: integer "year"
  , albumArt: text "album_art"
  , uri: text "uri" # unique
  , artistUri: text "artist_uri"
  , appleMusicLink: text "apple_music_link" # unique
  , spotifyLink: text "spotify_link" # unique
  , tidalLink: text "tidal_link" # unique
  , youtubeLink: text "youtube_link" # unique
  , sha256: text "sha256" # notNull # unique
  , discogsReleaseId: text "discogs_release_id" # references (columns DiscogsReleases.discogsReleases).id
  , createdAt: timestamp "xata_createdat" # notNull # defaultNow
  , updatedAt: timestamp "xata_updatedat" # notNull # defaultNow
  , xataVersion: integer "xata_version"
  }

type SelectAlbum =
  { id :: String
  , title :: String
  , artist :: String
  , releaseDate :: Nullable String
  , year :: Nullable Int
  , albumArt :: Nullable String
  , uri :: Nullable String
  , artistUri :: Nullable String
  , appleMusicLink :: Nullable String
  , spotifyLink :: Nullable String
  , tidalLink :: Nullable String
  , youtubeLink :: Nullable String
  , sha256 :: String
  , discogsReleaseId :: Nullable String
  , createdAt :: JSDate
  , updatedAt :: JSDate
  , xataVersion :: Nullable Int
  }
