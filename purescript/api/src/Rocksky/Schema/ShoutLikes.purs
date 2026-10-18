module Rocksky.Schema.ShoutLikes
  ( shoutLikes
  , ShoutLikesCols
  , SelectShoutLike
  ) where

import Prelude

import Data.JSDate (JSDate)
import Drizzle.Dialect (Postgres)
import Drizzle.PG.Schema (table, text, timestamp, defaultNow, references)
import Drizzle.SQL (raw)
import Drizzle.Schema (Column, Table, columns, notNull, primaryKey, unique, defaultSQL)
import Rocksky.Schema.Shouts as Shouts
import Rocksky.Schema.Users as Users

-- Indexes and table constraints are defined in the TS schema for drizzle-kit; queries do not need them.

type ShoutLikesCols =
  ( id :: Column Postgres String
  , userId :: Column Postgres String
  , shoutId :: Column Postgres String
  , createdAt :: Column Postgres JSDate
  , uri :: Column Postgres String
  )

shoutLikes :: Table Postgres ShoutLikesCols
shoutLikes = table "shout_likes"
  { id: text "xata_id" # notNull # primaryKey # defaultSQL (raw "xata_id()")
  , userId: text "user_id" # notNull # references (columns Users.users).id
  , shoutId: text "shout_id" # notNull # references (columns Shouts.shouts).id
  , createdAt: timestamp "xata_createdat" # notNull # defaultNow
  , uri: text "uri" # notNull # unique
  }

type SelectShoutLike =
  { id :: String
  , userId :: String
  , shoutId :: String
  , createdAt :: JSDate
  , uri :: String
  }
