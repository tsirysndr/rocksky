module Rocksky.Schema.EventRsvps
  ( eventRsvps
  , EventRsvpsCols
  , SelectEventRsvp
  ) where

import Prelude

import Data.JSDate (JSDate)
import Data.Nullable (Nullable)
import Drizzle.Dialect (Postgres)
import Drizzle.PG.Schema (table, text, timestamp, defaultNow, references)
import Drizzle.SQL (raw)
import Drizzle.Schema (Column, Table, columns, notNull, primaryKey, unique, defaultSQL)
import Rocksky.Schema.Events as Events
import Rocksky.Schema.Users as Users

-- Indexes and table constraints are defined in the TS schema for drizzle-kit; queries do not need them.
--
-- community.lexicon.calendar.rsvp records whose subject is an indexed event.
-- One row per (event, user): a newer rsvp record from the same user replaces
-- the older one's uri and status.

type EventRsvpsCols =
  ( id :: Column Postgres String
  , eventId :: Column Postgres String
  , userId :: Column Postgres String
  , uri :: Column Postgres String
  , cid :: Column Postgres (Nullable String)
  , status :: Column Postgres String
  , createdAt :: Column Postgres JSDate
  , updatedAt :: Column Postgres JSDate
  )

eventRsvps :: Table Postgres EventRsvpsCols
eventRsvps = table "event_rsvps"
  { id: text "xata_id" # notNull # primaryKey # defaultSQL (raw "xata_id()")
  -- TS also sets { onDelete: "cascade" } on the FK (drizzle-kit only).
  , eventId: text "event_id" # notNull # references (columns Events.events).id
  , userId: text "user_id" # notNull # references (columns Users.users).id
  , uri: text "uri" # notNull # unique
  , cid: text "cid"
  -- A community.lexicon.calendar.rsvp status token.
  , status: text "status" # notNull
  , createdAt: timestamp "xata_createdat" # notNull # defaultNow
  , updatedAt: timestamp "xata_updatedat" # notNull # defaultNow
  }

type SelectEventRsvp =
  { id :: String
  , eventId :: String
  , userId :: String
  , uri :: String
  , cid :: Nullable String
  , status :: String
  , createdAt :: JSDate
  , updatedAt :: JSDate
  }
