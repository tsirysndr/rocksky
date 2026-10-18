module Rocksky.Schema.SpotifyAccounts
  ( spotifyAccounts
  , SpotifyAccountsCols
  , SelectSpotifyAccount
  ) where

import Prelude

import Data.JSDate (JSDate)
import Data.Nullable (Nullable)
import Drizzle.Dialect (Postgres)
import Drizzle.PG.Schema (table, text, integer, boolean, timestamp, defaultNow, references)
import Drizzle.SQL (raw)
import Drizzle.Schema (Column, Table, columns, notNull, primaryKey, withDefault, defaultSQL)
import Rocksky.Schema.Users as Users

-- Indexes and table constraints are defined in the TS schema for drizzle-kit; queries do not need them.

type SpotifyAccountsCols =
  ( id :: Column Postgres String
  , xataVersion :: Column Postgres (Nullable Int)
  , email :: Column Postgres String
  , userId :: Column Postgres String
  , isBetaUser :: Column Postgres Boolean
  , spotifyAppId :: Column Postgres (Nullable String)
  , createdAt :: Column Postgres JSDate
  , updatedAt :: Column Postgres JSDate
  )

spotifyAccounts :: Table Postgres SpotifyAccountsCols
spotifyAccounts = table "spotify_accounts"
  { id: text "xata_id" # notNull # primaryKey # defaultSQL (raw "xata_id()")
  , xataVersion: integer "xata_version"
  , email: text "email" # notNull
  , userId: text "user_id" # notNull # references (columns Users.users).id
  , isBetaUser: boolean "is_beta_user" # notNull # withDefault false
  , spotifyAppId: text "spotify_app_id"
  , createdAt: timestamp "xata_createdat" # notNull # defaultNow
  , updatedAt: timestamp "xata_updatedat" # notNull # defaultNow
  }

type SelectSpotifyAccount =
  { id :: String
  , xataVersion :: Nullable Int
  , email :: String
  , userId :: String
  , isBetaUser :: Boolean
  , spotifyAppId :: Nullable String
  , createdAt :: JSDate
  , updatedAt :: JSDate
  }
