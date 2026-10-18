module Rocksky.Schema.SpotifyTokens
  ( spotifyTokens
  , SpotifyTokensCols
  , SelectSpotifyToken
  ) where

import Prelude

import Data.JSDate (JSDate)
import Data.Nullable (Nullable)
import Drizzle.Dialect (Postgres)
import Drizzle.PG.Schema (table, text, integer, timestamp, defaultNow, references)
import Drizzle.SQL (raw)
import Drizzle.Schema (Column, Table, columns, notNull, primaryKey, defaultSQL)
import Rocksky.Schema.Users as Users

-- Indexes and table constraints are defined in the TS schema for drizzle-kit; queries do not need them.

type SpotifyTokensCols =
  ( id :: Column Postgres String
  , xataVersion :: Column Postgres (Nullable Int)
  , accessToken :: Column Postgres String
  , refreshToken :: Column Postgres String
  , userId :: Column Postgres String
  , spotifyAppId :: Column Postgres String
  , createdAt :: Column Postgres JSDate
  , updatedAt :: Column Postgres JSDate
  )

spotifyTokens :: Table Postgres SpotifyTokensCols
spotifyTokens = table "spotify_tokens"
  { id: text "xata_id" # notNull # primaryKey # defaultSQL (raw "xata_id()")
  , xataVersion: integer "xata_version"
  , accessToken: text "access_token" # notNull
  , refreshToken: text "refresh_token" # notNull
  , userId: text "user_id" # notNull # references (columns Users.users).id
  , spotifyAppId: text "spotify_app_id" # notNull
  , createdAt: timestamp "xata_createdat" # notNull # defaultNow
  , updatedAt: timestamp "xata_updatedat" # notNull # defaultNow
  }

type SelectSpotifyToken =
  { id :: String
  , xataVersion :: Nullable Int
  , accessToken :: String
  , refreshToken :: String
  , userId :: String
  , spotifyAppId :: String
  , createdAt :: JSDate
  , updatedAt :: JSDate
  }
