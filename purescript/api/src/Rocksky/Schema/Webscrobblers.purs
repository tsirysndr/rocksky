module Rocksky.Schema.Webscrobblers
  ( webscrobblers
  , WebscrobblersCols
  , SelectWebscrobblers
  ) where

import Prelude

import Data.JSDate (JSDate)
import Data.Nullable (Nullable)
import Drizzle.Dialect (Postgres)
import Drizzle.PG.Schema (table, text, boolean, timestamp, defaultNow, references)
import Drizzle.SQL (raw)
import Drizzle.Schema (Column, Table, columns, notNull, primaryKey, withDefault, defaultSQL)
import Rocksky.Schema.Users as Users

-- Indexes and table constraints are defined in the TS schema for drizzle-kit; queries do not need them.

type WebscrobblersCols =
  ( id :: Column Postgres String
  , name :: Column Postgres String
  , uuid :: Column Postgres String
  , description :: Column Postgres (Nullable String)
  , enabled :: Column Postgres Boolean
  , userId :: Column Postgres String
  , createdAt :: Column Postgres JSDate
  , updatedAt :: Column Postgres JSDate
  )

webscrobblers :: Table Postgres WebscrobblersCols
webscrobblers = table "webscrobblers"
  { id: text "xata_id" # notNull # primaryKey # defaultSQL (raw "xata_id()")
  , name: text "name" # notNull
  , uuid: text "uuid" # notNull
  , description: text "description"
  , enabled: boolean "enabled" # notNull # withDefault true
  , userId: text "user_id" # notNull # references (columns Users.users).id
  , createdAt: timestamp "xata_createdat" # notNull # defaultNow
  , updatedAt: timestamp "xata_updatedat" # notNull # defaultNow
  }

type SelectWebscrobblers =
  { id :: String
  , name :: String
  , uuid :: String
  , description :: Nullable String
  , enabled :: Boolean
  , userId :: String
  , createdAt :: JSDate
  , updatedAt :: JSDate
  }
