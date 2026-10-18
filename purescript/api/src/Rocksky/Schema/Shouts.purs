module Rocksky.Schema.Shouts
  ( shouts
  , ShoutsCols
  , SelectShout
  ) where

import Prelude

import Data.JSDate (JSDate)
import Data.Nullable (Nullable)
import Drizzle.Dialect (Postgres)
import Drizzle.PG.Schema (table, text, integer, timestamp, jsonb, defaultNow, references, referencesLazy)
import Drizzle.SQL (raw)
import Drizzle.Schema (Column, Table, columns, notNull, primaryKey, unique, defaultSQL)
import Foreign (Foreign)
import Rocksky.Schema.Albums as Albums
import Rocksky.Schema.Scrobbles as Scrobbles
import Rocksky.Schema.Tracks as Tracks
import Rocksky.Schema.Users as Users

-- Indexes and table constraints are defined in the TS schema for drizzle-kit; queries do not need them.

type ShoutsCols =
  ( id :: Column Postgres String
  , content :: Column Postgres String
  , trackId :: Column Postgres (Nullable String)
  , artistId :: Column Postgres (Nullable String)
  , albumId :: Column Postgres (Nullable String)
  , scrobbleId :: Column Postgres (Nullable String)
  , uri :: Column Postgres String
  , authorId :: Column Postgres String
  , parentId :: Column Postgres (Nullable String)
  , gifUrl :: Column Postgres (Nullable String)
  , gifPreviewUrl :: Column Postgres (Nullable String)
  , gifAlt :: Column Postgres (Nullable String)
  , gifWidth :: Column Postgres (Nullable Int)
  , gifHeight :: Column Postgres (Nullable Int)
  , facets :: Column Postgres (Nullable Foreign)
  , createdAt :: Column Postgres JSDate
  , updatedAt :: Column Postgres JSDate
  )

shouts :: Table Postgres ShoutsCols
shouts = table "shouts"
  { id: text "xata_id" # notNull # primaryKey # defaultSQL (raw "xata_id()")
  , content: text "content" # notNull
  , trackId: text "track_id" # references (columns Tracks.tracks).id
  , artistId: text "artist_id" # references (columns Users.users).id
  , albumId: text "album_id" # references (columns Albums.albums).id
  , scrobbleId: text "scrobble_id" # references (columns Scrobbles.scrobbles).id
  , uri: text "uri" # notNull # unique
  , authorId: text "author_id" # notNull # references (columns Users.users).id
  , parentId: text "parent_id" # referencesLazy (\_ -> (columns shouts).id)
  , gifUrl: text "gif_url"
  , gifPreviewUrl: text "gif_preview_url"
  , gifAlt: text "gif_alt"
  , gifWidth: integer "gif_width"
  , gifHeight: integer "gif_height"
  , facets: jsonb "facets"
  , createdAt: timestamp "xata_createdat" # notNull # defaultNow
  , updatedAt: timestamp "xata_updatedat" # notNull # defaultNow
  }

type SelectShout =
  { id :: String
  , content :: String
  , trackId :: Nullable String
  , artistId :: Nullable String
  , albumId :: Nullable String
  , scrobbleId :: Nullable String
  , uri :: String
  , authorId :: String
  , parentId :: Nullable String
  , gifUrl :: Nullable String
  , gifPreviewUrl :: Nullable String
  , gifAlt :: Nullable String
  , gifWidth :: Nullable Int
  , gifHeight :: Nullable Int
  , facets :: Nullable Foreign
  , createdAt :: JSDate
  , updatedAt :: JSDate
  }
