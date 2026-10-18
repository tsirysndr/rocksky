-- | The SQLite database holding OAuth sessions and state (`src/db.ts`),
-- | through Kysely over better-sqlite3.
module Rocksky.Db
  ( Database
  , createDb
  , migrateToLatest
  , AuthSessionRow
  , getAuthSession
  , upsertAuthSession
  , deleteAuthSession
  , AuthStateRow
  , getAuthState
  , upsertAuthState
  , deleteAuthState
  , listAuthSessions
  ) where

import Prelude

import BetterSqlite3 as Sqlite
import Data.Maybe (Maybe)
import Data.Nullable (Nullable)
import Effect (Effect)
import Effect.Aff (Aff)
import Kysely (Kysely)
import Kysely as Kysely
import Rocksky.Lib.Foreign (toForeign, unsafeFromForeign)

type Database = Kysely

type AuthSessionRow = { key :: String, session :: String, expiresAt :: Nullable String }
type AuthStateRow = { key :: String, state :: String }

createDb :: String -> Effect Database
createDb location = do
  sqlite <- Sqlite.open location
  -- Two processes share this file (the XRPC service and the REST API) and
  -- under the default rollback journal a writer takes an exclusive lock that
  -- blocks every reader. The OAuth client reads `auth_session` on virtually
  -- every authenticated request and cannot tell a locked file from a deleted
  -- session: a failed read becomes a 401, a failed write gets the refresh
  -- token revoked at the PDS. WAL lets readers run straight through a
  -- concurrent write.
  Sqlite.pragma sqlite "journal_mode = WAL"
  Sqlite.pragma sqlite "busy_timeout = 5000"
  -- WAL's default (FULL) fsyncs on every commit. NORMAL keeps the guarantee
  -- that matters: a crash cannot corrupt the file, only lose the last commit
  -- or two, and a lost session refresh is re-fetched on next use.
  Sqlite.pragma sqlite "synchronous = NORMAL"
  Kysely.fromSqlite sqlite

-- Migration names must stay "001"/"002": existing databases recorded them.
migrations :: Array Kysely.Migration
migrations =
  [ { name: "001"
    , up:
        [ "create table \"status\" (\"uri\" varchar primary key, \"authorDid\" varchar not null, \"status\" varchar not null, \"createdAt\" varchar not null, \"indexedAt\" varchar not null)"
        , "create table \"auth_session\" (\"key\" varchar primary key, \"session\" varchar not null)"
        , "create table \"auth_state\" (\"key\" varchar primary key, \"state\" varchar not null)"
        ]
    , down: [ "drop table \"auth_state\"", "drop table \"auth_session\"", "drop table \"status\"" ]
    }
  , { name: "002"
    -- Kysely's defaultTo("NULL") binds the string 'NULL' (not SQL NULL); kept
    -- for parity with rows created by the TypeScript migration.
    , up: [ "alter table \"auth_session\" add column \"expiresAt\" text default 'NULL'" ]
    , down: [ "alter table \"auth_session\" drop column \"expiresAt\"" ]
    }
  ]

migrateToLatest :: Database -> Aff Unit
migrateToLatest db = Kysely.migrateToLatest db migrations

getAuthSession :: Database -> String -> Aff (Maybe AuthSessionRow)
getAuthSession db key = map unsafeFromForeign <$> Kysely.rawOne db "select * from \"auth_session\" where \"key\" = ?" [ toForeign key ]

upsertAuthSession :: Database -> String -> String -> Nullable String -> Aff Unit
upsertAuthSession db key session expiresAt = Kysely.raw db
  "insert into \"auth_session\" (\"key\", \"session\", \"expiresAt\") values (?, ?, ?) on conflict(\"key\") do update set \"session\" = excluded.\"session\", \"expiresAt\" = excluded.\"expiresAt\""
  [ toForeign key, toForeign session, toForeign expiresAt ]

deleteAuthSession :: Database -> String -> Aff Unit
deleteAuthSession db key = Kysely.raw db "delete from \"auth_session\" where \"key\" = ?" [ toForeign key ]

listAuthSessions :: Database -> Aff (Array AuthSessionRow)
listAuthSessions db = map unsafeFromForeign <$> Kysely.rawRows db "select * from \"auth_session\"" []

getAuthState :: Database -> String -> Aff (Maybe AuthStateRow)
getAuthState db key = map unsafeFromForeign <$> Kysely.rawOne db "select * from \"auth_state\" where \"key\" = ?" [ toForeign key ]

upsertAuthState :: Database -> String -> String -> Aff Unit
upsertAuthState db key state = Kysely.raw db
  "insert into \"auth_state\" (\"key\", \"state\") values (?, ?) on conflict(\"key\") do update set \"state\" = excluded.\"state\""
  [ toForeign key, toForeign state ]

deleteAuthState :: Database -> String -> Aff Unit
deleteAuthState db key = Kysely.raw db "delete from \"auth_state\" where \"key\" = ?" [ toForeign key ]
