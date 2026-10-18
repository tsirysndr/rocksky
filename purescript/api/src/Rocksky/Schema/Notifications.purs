module Rocksky.Schema.Notifications
  ( notifications
  , NotificationsCols
  , SelectNotification
  ) where

import Prelude

import Data.JSDate (JSDate)
import Data.Nullable (Nullable)
import Drizzle.Dialect (Postgres)
import Drizzle.PG.Schema (table, text, boolean, timestamp, timestampTz, defaultNow, references)
import Drizzle.SQL (raw)
import Drizzle.Schema (Column, Table, columns, notNull, primaryKey, withDefault, defaultSQL)
import Rocksky.Schema.Shouts as Shouts
import Rocksky.Schema.Users as Users

-- Indexes and table constraints are defined in the TS schema for drizzle-kit; queries do not need them.

type NotificationsCols =
  ( id :: Column Postgres String
  , userId :: Column Postgres String
  , actorId :: Column Postgres String
  , type :: Column Postgres String
  , shoutId :: Column Postgres (Nullable String)
  , subjectUri :: Column Postgres (Nullable String)
  , read :: Column Postgres Boolean
  , readAt :: Column Postgres (Nullable JSDate)
  , createdAt :: Column Postgres JSDate
  )

notifications :: Table Postgres NotificationsCols
notifications = table "notifications"
  { id: text "xata_id" # notNull # primaryKey # defaultSQL (raw "xata_id()")
  , userId: text "user_id" # notNull # references (columns Users.users).id
  , actorId: text "actor_id" # notNull # references (columns Users.users).id
  , type: text "type" # notNull
  , shoutId: text "shout_id" # references (columns Shouts.shouts).id
  , subjectUri: text "subject_uri"
  , read: boolean "read" # notNull # withDefault false
  , readAt: timestampTz "read_at"
  , createdAt: timestamp "xata_createdat" # notNull # defaultNow
  }

type SelectNotification =
  { id :: String
  , userId :: String
  , actorId :: String
  , type :: String
  , shoutId :: Nullable String
  , subjectUri :: Nullable String
  , read :: Boolean
  , readAt :: Nullable JSDate
  , createdAt :: JSDate
  }
