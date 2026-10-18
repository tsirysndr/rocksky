module Rocksky.Schema.Events
  ( events
  , EventsCols
  , SelectEvent
  ) where

import Prelude

import Data.JSDate (JSDate)
import Data.Nullable (Nullable)
import Drizzle.Dialect (Postgres)
import Drizzle.PG.Schema (table, text, integer, timestamp, timestampTz, jsonb, textArray, defaultNow, references, referencesLazy)
import Drizzle.SQL (raw)
import Drizzle.Schema (Column, Table, columns, notNull, primaryKey, unique, defaultSQL)
import Foreign (Foreign)
import Rocksky.Schema.Users as Users

-- Indexes and table constraints are defined in the TS schema for drizzle-kit; queries do not need them.
--
-- A music event is a community.lexicon.calendar.event record plus the
-- app.rocksky.event.music record that marks it as one and names the lineup.
-- Both halves live in one row: a calendar event without the music annotation
-- is never indexed, and dropping the annotation drops the row.
--
-- Rows are written by jetstream only (crates/jetstream/src/event.rs).

type EventsCols =
  ( id :: Column Postgres String
  , uri :: Column Postgres String
  , cid :: Column Postgres (Nullable String)
  , musicUri :: Column Postgres String
  , musicCid :: Column Postgres (Nullable String)
  , name :: Column Postgres String
  , description :: Column Postgres (Nullable String)
  , startsAt :: Column Postgres (Nullable JSDate)
  , endsAt :: Column Postgres (Nullable JSDate)
  , mode :: Column Postgres (Nullable String)
  , status :: Column Postgres (Nullable String)
  , locations :: Column Postgres (Nullable Foreign)
  , uris :: Column Postgres (Nullable Foreign)
  , media :: Column Postgres (Nullable Foreign)
  , kind :: Column Postgres (Nullable String)
  , genre :: Column Postgres (Nullable String)
  , tags :: Column Postgres (Nullable (Array String))
  , externalIds :: Column Postgres (Nullable Foreign)
  , ticketsUrl :: Column Postgres (Nullable String)
  , imageUrl :: Column Postgres (Nullable String)
  , createdBy :: Column Postgres String
  , sha256 :: Column Postgres (Nullable String)
  , duplicateOf :: Column Postgres (Nullable String)
  , createdAt :: Column Postgres (Nullable JSDate)
  , xataCreatedAt :: Column Postgres JSDate
  , updatedAt :: Column Postgres JSDate
  , xataVersion :: Column Postgres (Nullable Int)
  )

events :: Table Postgres EventsCols
events = table "events"
  { id: text "xata_id" # notNull # primaryKey # defaultSQL (raw "xata_id()")
  , uri: text "uri" # notNull # unique
  , cid: text "cid"
  , musicUri: text "music_uri" # notNull # unique
  , musicCid: text "music_cid"
  , name: text "name" # notNull
  , description: text "description"
  , startsAt: timestampTz "starts_at"
  , endsAt: timestampTz "ends_at"
  , mode: text "mode"
  , status: text "status"
  -- The record's `locations`, `uris` and `media` arrays, verbatim.
  , locations: jsonb "locations"
  , uris: jsonb "uris"
  , media: jsonb "media"
  , kind: text "kind"
  , genre: text "genre"
  , tags: textArray "tags"
  , externalIds: jsonb "external_ids"
  , ticketsUrl: text "tickets_url"
  , imageUrl: text "image_url"
  , createdBy: text "created_by" # notNull # references (columns Users.users).id
  -- Fingerprint of the show (headliner, day, venue); null for undated events.
  , sha256: text "sha256"
  -- Set when another indexed event describes the same show, by fingerprint
  -- or a shared external id. Readers list rows where this is null and pool
  -- RSVPs across the group; the FK clears it when the canonical row goes.
  -- TS also sets { onDelete: "set null" } on the FK (drizzle-kit only).
  , duplicateOf: text "duplicate_of" # referencesLazy (\_ -> (columns events).id)
  -- The calendar record's own createdAt.
  , createdAt: timestampTz "created_at"
  , xataCreatedAt: timestamp "xata_createdat" # notNull # defaultNow
  , updatedAt: timestamp "xata_updatedat" # notNull # defaultNow
  , xataVersion: integer "xata_version"
  }

type SelectEvent =
  { id :: String
  , uri :: String
  , cid :: Nullable String
  , musicUri :: String
  , musicCid :: Nullable String
  , name :: String
  , description :: Nullable String
  , startsAt :: Nullable JSDate
  , endsAt :: Nullable JSDate
  , mode :: Nullable String
  , status :: Nullable String
  , locations :: Nullable Foreign
  , uris :: Nullable Foreign
  , media :: Nullable Foreign
  , kind :: Nullable String
  , genre :: Nullable String
  , tags :: Nullable (Array String)
  , externalIds :: Nullable Foreign
  , ticketsUrl :: Nullable String
  , imageUrl :: Nullable String
  , createdBy :: String
  , sha256 :: Nullable String
  , duplicateOf :: Nullable String
  , createdAt :: Nullable JSDate
  , xataCreatedAt :: JSDate
  , updatedAt :: JSDate
  , xataVersion :: Nullable Int
  }
