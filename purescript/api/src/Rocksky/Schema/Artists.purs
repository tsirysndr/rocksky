module Rocksky.Schema.Artists
  ( artists
  , ArtistsCols
  , SelectArtist
  ) where

import Prelude

import Data.JSDate (JSDate)
import Data.Nullable (Nullable)
import Drizzle.Dialect (Postgres)
import Drizzle.PG.Schema (table, text, integer, timestamp, textArray, defaultNow)
import Drizzle.SQL (raw)
import Drizzle.Schema (Column, Table, notNull, primaryKey, unique, defaultSQL)

-- Indexes and table constraints are defined in the TS schema for drizzle-kit; queries do not need them.

type ArtistsCols =
  ( id :: Column Postgres String
  , name :: Column Postgres String
  , biography :: Column Postgres (Nullable String)
  , born :: Column Postgres (Nullable JSDate)
  , bornIn :: Column Postgres (Nullable String)
  , died :: Column Postgres (Nullable JSDate)
  , picture :: Column Postgres (Nullable String)
  , sha256 :: Column Postgres String
  , uri :: Column Postgres (Nullable String)
  , appleMusicLink :: Column Postgres (Nullable String)
  , spotifyLink :: Column Postgres (Nullable String)
  , tidalLink :: Column Postgres (Nullable String)
  , youtubeLink :: Column Postgres (Nullable String)
  , genres :: Column Postgres (Nullable (Array String))
  , createdAt :: Column Postgres JSDate
  , updatedAt :: Column Postgres JSDate
  , xataVersion :: Column Postgres (Nullable Int)
  )

artists :: Table Postgres ArtistsCols
artists = table "artists"
  { id: text "xata_id" # notNull # primaryKey # defaultSQL (raw "xata_id()")
  , name: text "name" # notNull
  , biography: text "biography"
  , born: timestamp "born"
  , bornIn: text "born_in"
  , died: timestamp "died"
  , picture: text "picture"
  , sha256: text "sha256" # notNull # unique
  , uri: text "uri" # unique
  , appleMusicLink: text "apple_music_link"
  , spotifyLink: text "spotify_link"
  , tidalLink: text "tidal_link"
  , youtubeLink: text "youtube_link"
  , genres: textArray "genres"
  , createdAt: timestamp "xata_createdat" # notNull # defaultNow
  , updatedAt: timestamp "xata_updatedat" # notNull # defaultNow
  , xataVersion: integer "xata_version"
  }

type SelectArtist =
  { id :: String
  , name :: String
  , biography :: Nullable String
  , born :: Nullable JSDate
  , bornIn :: Nullable String
  , died :: Nullable JSDate
  , picture :: Nullable String
  , sha256 :: String
  , uri :: Nullable String
  , appleMusicLink :: Nullable String
  , spotifyLink :: Nullable String
  , tidalLink :: Nullable String
  , youtubeLink :: Nullable String
  , genres :: Nullable (Array String)
  , createdAt :: JSDate
  , updatedAt :: JSDate
  , xataVersion :: Nullable Int
  }
