# purescript-drizzle

Typed PureScript bindings for [Drizzle ORM](https://orm.drizzle.team/), covering
Postgres, MySQL and SQLite with one query builder. Runs on Bun and Node.js.

- Tables are declared once, with their column types; select results, inserts and
  updates are checked against them at compile time, and result row types are
  inferred.
- A `Dialect` phantom type ties tables, queries and connections together, so a
  Postgres table cannot be run through a SQLite connection.
- Queries are pure values. They are only handed to drizzle when executed or
  rendered.

## Install

```sh
spago install drizzle
bun add drizzle-orm
# plus one driver:
bun add @electric-sql/pglite   # Postgres, in-process
bun add pg                     # Postgres, node-postgres
bun add mysql2                 # MySQL
bun add @libsql/client         # SQLite / Turso, Bun or Node
bun add better-sqlite3         # SQLite, Node.js only
# bun:sqlite needs nothing extra (Bun only)
```

## Usage

```purescript
import Prelude

import Data.Nullable (Nullable)
import Data.Nullable as N
import Drizzle.Dialect (Postgres)
import Drizzle.PG.PGlite as PGlite
import Drizzle.PG.Schema (integer, serial, table, text)
import Drizzle.Query (insert, limit, orderBy, runInsertReturning, runSelect, select, where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (Column, Table, columns, notNull, primaryKey, toSQL)
import Effect.Aff (launchAff_)
import Effect.Class (liftEffect)
import Effect.Class.Console (logShow)

type Users =
  ( id :: Column Postgres Int
  , name :: Column Postgres String
  , age :: Column Postgres (Nullable Int)
  )

users :: Table Postgres Users
users = table "users"
  { id: serial "id" # primaryKey
  , name: text "name" # notNull
  , age: integer "age"
  }

main = launchAff_ do
  db <- liftEffect (PGlite.open Nothing)
  let u = columns users

  created <- runInsertReturning db $ insert users
    [ { name: "Ada", age: N.notNull 36 }
    , { name: "Bob", age: N.null }
    ]
  logShow (map _.id created)

  -- rows :: Array { id :: Int, name :: String, age :: Nullable Int }, inferred
  rows <- runSelect db $ select users
    # where_ (SQL.gt (toSQL u.age) (SQL.param 18))
    # orderBy [ SQL.asc (toSQL u.name) ]
    # limit 10
  logShow (map _.name rows)
```

See `examples/` for complete programs (`bun run example Example.Blog`,
`Example.Todo`, `Example.MySQL`).

## Modules

| Module | Contents |
| --- | --- |
| `Drizzle.SQL` | `SQL` fragments: `raw`, `param`, `eq`, `and`, `or`, `like`, `inArray`, `asc`, `desc`, ... |
| `Drizzle.Schema` | `Table`, `Column`, `columns`, `toSQL`, modifiers `notNull`, `primaryKey`, `unique`, `withDefault`, `defaultSQL` |
| `Drizzle.PG.Schema` | Postgres `table` and columns: `serial`, `integer`, `bigint`, `text`, `varchar`, `boolean`, `real`, `timestamp`, `defaultNow` |
| `Drizzle.MySQL.Schema` | MySQL `table` and columns: `serial`, `int`, `bigint`, `varchar`, `text`, `boolean`, `double`, `timestamp`, `datetime`, `autoIncrement`, `defaultNow` |
| `Drizzle.SQLite.Schema` | SQLite `table` and columns: `integer`, `integerBoolean`, `integerTimestamp`, `text`, `real`, `primaryKeyAutoIncrement` |
| `Drizzle.Query` | `select`/`where_`/`orderBy`/`limit`/`offset`, `insert`, `update`, `deleteFrom`, the `run*` and `run*Returning` executors, `toQuery` |
| `Drizzle.Database` | `Database d` and `execute` for raw statements |
| `Drizzle.PG.PGlite`, `Drizzle.PG.NodePostgres` | Postgres drivers |
| `Drizzle.MySQL.MySQL2` | MySQL driver, plus `mock` for rendering |
| `Drizzle.SQLite.Native` | Embedded SQLite for the current runtime: `bun:sqlite` on Bun, better-sqlite3 on Node.js |
| `Drizzle.SQLite.BunSQLite`, `Drizzle.SQLite.BetterSQLite3`, `Drizzle.SQLite.LibSQL` | SQLite drivers |

## Design notes

**Nullability.** Columns are nullable by default and typed `Column d (Nullable a)`.
`notNull` turns that into `Column d a`. `Nullable` is used instead of `Maybe`
because it is a JS `null` at runtime, so rows cross the FFI untouched; call
`toMaybe` when you need a `Maybe`.

**Inserts and updates** take a record whose fields must be a subset of the table's
columns, with matching types. All rows of one insert share a record type, so
optional columns must be given explicitly (`N.null`) rather than omitted in some
rows only.

**`returning`** is available for Postgres and SQLite. For MySQL the
`run*Returning` functions are a compile error, because of the `Returning d`
constraint.

**`where_`** replaces any previous condition, as in drizzle. Combine conditions
with `SQL.and` / `SQL.or`.

**Rendering.** `toQuery db q` gives `{ sql, params }` without running anything.
`NodePostgres.mock` and `MySQL2.mock` provide a connectionless database for it.

## Runtimes

Everything works on both Bun and Node.js (18+). The one difference is the
embedded SQLite driver: `bun:sqlite` exists only on Bun and better-sqlite3 is a
native addon that only Node.js can load. Both modules load their dependency
lazily, so importing them is safe anywhere; `Drizzle.SQLite.Native` picks the
right one at runtime, and each driver exposes `available :: Effect Boolean`.
libSQL and all Postgres and MySQL drivers run on both runtimes.

## Development

```sh
bun install
bun run test                      # under Bun: PGlite, bun:sqlite, libSQL, rendering tests
bun run test:node                 # same suite under Node.js, with better-sqlite3
bun run example Example.Blog      # DATABASE_URL=postgres://... to use a real server
bun run example:node Example.Todo # any example under Node.js
bun run example Example.MySQL     # MYSQL_URL=mysql://... to run against a server
```
