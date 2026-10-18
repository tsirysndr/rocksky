module Rocksky.Schema.ImportJobs
  ( importJobs
  , ImportJobsCols
  , SelectImportJob
  ) where

import Prelude

import Data.JSDate (JSDate)
import Data.Nullable (Nullable)
import Data.Nullable as N
import Drizzle.Dialect (Postgres)
import Drizzle.PG.Schema (table, text, integer, timestamp, defaultNow, references)
import Drizzle.SQL (raw)
import Drizzle.Schema (Column, Table, columns, notNull, primaryKey, withDefault, defaultSQL)
import Rocksky.Schema.Users as Users

-- Indexes and table constraints are defined in the TS schema for drizzle-kit; queries do not need them.

type ImportJobsCols =
  ( id :: Column Postgres String
  , userId :: Column Postgres (Nullable String)
  , type :: Column Postgres String
  , status :: Column Postgres String
  , total :: Column Postgres (Nullable Int)
  , processed :: Column Postgres (Nullable Int)
  , failed :: Column Postgres (Nullable Int)
  , errors :: Column Postgres (Nullable String)
  , createdAt :: Column Postgres JSDate
  , updatedAt :: Column Postgres JSDate
  , xataVersion :: Column Postgres (Nullable Int)
  )

importJobs :: Table Postgres ImportJobsCols
importJobs = table "import_jobs"
  { id: text "xata_id" # notNull # primaryKey # defaultSQL (raw "xata_id()")
  , userId: text "user_id" # references (columns Users.users).id
  , type: text "type" # notNull
  , status: text "status" # notNull # withDefault "pending"
  , total: integer "total" # withDefault (N.notNull 0)
  , processed: integer "processed" # withDefault (N.notNull 0)
  , failed: integer "failed" # withDefault (N.notNull 0)
  , errors: text "errors"
  , createdAt: timestamp "xata_createdat" # notNull # defaultNow
  , updatedAt: timestamp "xata_updatedat" # notNull # defaultNow
  , xataVersion: integer "xata_version"
  }

type SelectImportJob =
  { id :: String
  , userId :: Nullable String
  , type :: String
  , status :: String
  , total :: Nullable Int
  , processed :: Nullable Int
  , failed :: Nullable Int
  , errors :: Nullable String
  , createdAt :: JSDate
  , updatedAt :: JSDate
  , xataVersion :: Nullable Int
  }
