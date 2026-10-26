import Database from "better-sqlite3";
import { Kysely, SqliteDialect } from "kysely";
import { defineDriver } from "unstorage";
const DRIVER_NAME = "sqlite";
var stdin_default = defineDriver(
  ({
    location,
    table = "kv",
    getDb = () => {
      let _db = null;
      return (() => {
        if (_db) {
          return _db;
        }
        if (!location) {
          throw new Error("SQLite location is required");
        }
        const sqlite = new Database(location, { fileMustExist: false });
        sqlite.pragma("journal_mode = WAL");
        _db = new Kysely({
          dialect: new SqliteDialect({
            database: sqlite
          })
        });
        _db.schema.createTable(table).ifNotExists().addColumn("id", "text", (col) => col.primaryKey()).addColumn("value", "text", (col) => col.notNull()).addColumn("created_at", "text", (col) => col.notNull()).addColumn("updated_at", "text", (col) => col.notNull()).execute();
        return _db;
      })();
    }
  }) => {
    return {
      name: DRIVER_NAME,
      options: { location, table },
      getInstance: getDb,
      async hasItem(key) {
        const result = await getDb().selectFrom(table).select(["id"]).where("id", "=", key).executeTakeFirst();
        return !!result;
      },
      async getItem(key) {
        const result = await getDb().selectFrom(table).select(["value"]).where("id", "=", key).executeTakeFirst();
        return result?.value ?? null;
      },
      async setItem(key, value) {
        const now = (/* @__PURE__ */ new Date()).toISOString();
        await getDb().insertInto(table).values({
          id: key,
          value,
          created_at: now,
          updated_at: now
        }).onConflict(
          (oc) => oc.column("id").doUpdateSet({
            value,
            updated_at: now
          })
        ).execute();
      },
      async setItems(items) {
        const now = (/* @__PURE__ */ new Date()).toISOString();
        await getDb().transaction().execute(async (trx) => {
          await Promise.all(
            items.map(({ key, value }) => {
              return trx.insertInto(table).values({
                id: key,
                value,
                created_at: now,
                updated_at: now
              }).onConflict(
                (oc) => oc.column("id").doUpdateSet({
                  value,
                  updated_at: now
                })
              ).execute();
            })
          );
        });
      },
      async removeItem(key) {
        await getDb().deleteFrom(table).where("id", "=", key).execute();
      },
      async getMeta(key) {
        const result = await getDb().selectFrom(table).select(["created_at", "updated_at"]).where("id", "=", key).executeTakeFirst();
        if (!result) {
          return null;
        }
        return {
          birthtime: new Date(result.created_at),
          mtime: new Date(result.updated_at)
        };
      },
      async getKeys(base = "") {
        const results = await getDb().selectFrom(table).select(["id"]).where("id", "like", `${base}%`).execute();
        return results.map((r) => r.id);
      },
      async clear() {
        await getDb().deleteFrom(table).execute();
      },
      async dispose() {
        await getDb().destroy();
      }
    };
  }
);
export {
  stdin_default as default
};
