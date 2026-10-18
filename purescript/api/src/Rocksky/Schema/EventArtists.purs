module Rocksky.Schema.EventArtists
  ( eventArtists
  , EventArtistsCols
  , SelectEventArtist
  ) where

import Prelude

import Data.JSDate (JSDate)
import Data.Nullable (Nullable)
import Drizzle.Dialect (Postgres)
import Drizzle.PG.Schema (table, text, integer, timestamp, timestampTz, defaultNow, references)
import Drizzle.SQL (raw)
import Drizzle.Schema (Column, Table, columns, notNull, primaryKey, withDefault, defaultSQL)
import Rocksky.Schema.Artists as Artists
import Rocksky.Schema.Events as Events

-- Indexes and table constraints are defined in the TS schema for drizzle-kit; queries do not need them.
--
-- The lineup of an event, one row per billed artist, linked to the `artists`
-- row the name (or the record's artist AT-URI) resolved to. `name` is the
-- billing as written on the record, which can differ from artists.name.

type EventArtistsCols =
  ( id :: Column Postgres String
  , eventId :: Column Postgres String
  , artistId :: Column Postgres String
  , name :: Column Postgres String
  , role :: Column Postgres (Nullable String)
  , stage :: Column Postgres (Nullable String)
  , mbid :: Column Postgres (Nullable String)
  , startsAt :: Column Postgres (Nullable JSDate)
  , position :: Column Postgres Int
  , createdAt :: Column Postgres JSDate
  )

eventArtists :: Table Postgres EventArtistsCols
eventArtists = table "event_artists"
  { id: text "xata_id" # notNull # primaryKey # defaultSQL (raw "xata_id()")
  -- TS also sets { onDelete: "cascade" } on the FK (drizzle-kit only).
  , eventId: text "event_id" # notNull # references (columns Events.events).id
  , artistId: text "artist_id" # notNull # references (columns Artists.artists).id
  , name: text "name" # notNull
  , role: text "role"
  , stage: text "stage"
  , mbid: text "mbid"
  , startsAt: timestampTz "starts_at"
  , position: integer "position" # notNull # withDefault 0
  , createdAt: timestamp "xata_createdat" # notNull # defaultNow
  }

type SelectEventArtist =
  { id :: String
  , eventId :: String
  , artistId :: String
  , name :: String
  , role :: Nullable String
  , stage :: Nullable String
  , mbid :: Nullable String
  , startsAt :: Nullable JSDate
  , position :: Int
  , createdAt :: JSDate
  }
