-- | An unstorage driver over a SQLite table (`src/sqliteKv.ts`).
module Rocksky.SqliteKv (sqliteKvDriver, KvDb) where

import Prelude

import BetterSqlite3 as Sqlite
import Data.JSDate (JSDate, parse)
import Data.Maybe (Maybe(..), isJust)
import Data.Nullable (toNullable)
import Effect (Effect)
import Effect.Aff (Aff)
import Effect.Class (liftEffect)
import Data.JSDate as JSDate
import Kysely (Kysely)
import Kysely as Kysely
import Rocksky.Lib.Foreign (readStringAt, toForeign)
import Unstorage (Driver, defineDriver)

type KvDb = Kysely

nowIso :: Effect String
nowIso = do
  d <- JSDate.now
  JSDate.toISOString d

-- | `defineDriver({ location, table })`: opens the file lazily on first use
-- | (WAL mode) and creates the table when missing.
sqliteKvDriver :: { location :: String, table :: String } -> Effect Driver
sqliteKvDriver { location, table } = do
  sqlite <- Sqlite.open location
  Sqlite.pragma sqlite "journal_mode = WAL"
  db <- Kysely.fromSqlite sqlite
  Sqlite.exec sqlite $
    "create table if not exists \"" <> table <> "\" (\"id\" text primary key, \"value\" text not null, \"created_at\" text not null, \"updated_at\" text not null)"
  let
    t = "\"" <> table <> "\""
    upsert :: String -> String -> Aff Unit
    upsert key value = do
      now <- liftEffect nowIso
      Kysely.raw db
        ("insert into " <> t <> " (\"id\", \"value\", \"created_at\", \"updated_at\") values (?, ?, ?, ?) on conflict(\"id\") do update set \"value\" = excluded.\"value\", \"updated_at\" = excluded.\"updated_at\"")
        [ toForeign key, toForeign value, toForeign now, toForeign now ]
    parseDate :: String -> Aff JSDate
    parseDate s = liftEffect (parse s)
  pure $ defineDriver
    { name: "sqlite"
    , hasItem: \key -> isJust <$> Kysely.rawOne db ("select \"id\" from " <> t <> " where \"id\" = ?") [ toForeign key ]
    , getItem: \key -> do
        row <- Kysely.rawOne db ("select \"value\" from " <> t <> " where \"id\" = ?") [ toForeign key ]
        pure (row >>= readStringAt "value")
    , setItem: upsert
    , removeItem: \key -> Kysely.raw db ("delete from " <> t <> " where \"id\" = ?") [ toForeign key ]
    , getKeys: \base -> do
        rows <- Kysely.rawRows db ("select \"id\" from " <> t <> " where \"id\" like ?") [ toForeign (base <> "%") ]
        pure (rows >>= \r -> case readStringAt "id" r of
          Just id -> [ id ]
          Nothing -> [])
    , getMeta: \key -> do
        row <- Kysely.rawOne db ("select \"created_at\", \"updated_at\" from " <> t <> " where \"id\" = ?") [ toForeign key ]
        case row of
          Nothing -> pure Nothing
          Just r -> do
            birth <- case readStringAt "created_at" r of
              Just s -> Just <$> parseDate s
              Nothing -> pure Nothing
            m <- case readStringAt "updated_at" r of
              Just s -> Just <$> parseDate s
              Nothing -> pure Nothing
            pure (Just { birthtime: toNullable birth, mtime: toNullable m })
    , clear: Kysely.raw db ("delete from " <> t) []
    , dispose: Kysely.destroy db
    }
