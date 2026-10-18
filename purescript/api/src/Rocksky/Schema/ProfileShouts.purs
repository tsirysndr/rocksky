module Rocksky.Schema.ProfileShouts
  ( profileShouts
  , ProfileShoutsCols
  , SelectProfileShout
  ) where

import Prelude

import Data.JSDate (JSDate)
import Drizzle.Dialect (Postgres)
import Drizzle.PG.Schema (table, text, timestamp, defaultNow, references)
import Drizzle.SQL (raw)
import Drizzle.Schema (Column, Table, columns, notNull, primaryKey, defaultSQL)
import Rocksky.Schema.Shouts as Shouts
import Rocksky.Schema.Users as Users

-- Indexes and table constraints are defined in the TS schema for drizzle-kit; queries do not need them.

type ProfileShoutsCols =
  ( id :: Column Postgres String
  , userId :: Column Postgres String
  , shoutId :: Column Postgres String
  , createdAt :: Column Postgres JSDate
  )

profileShouts :: Table Postgres ProfileShoutsCols
profileShouts = table "profile_shouts"
  { id: text "xata_id" # notNull # primaryKey # defaultSQL (raw "xata_id()")
  , userId: text "user_id" # notNull # references (columns Users.users).id
  , shoutId: text "shout_id" # notNull # references (columns Shouts.shouts).id
  , createdAt: timestamp "xata_createdat" # notNull # defaultNow
  }

type SelectProfileShout =
  { id :: String
  , userId :: String
  , shoutId :: String
  , createdAt :: JSDate
  }
