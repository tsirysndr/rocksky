import { Kysely, Migrator, PostgresDialect, SqliteDialect, sql } from "kysely";
import pg from "pg";

export const fromSqlite = (database) => () => new Kysely({ dialect: new SqliteDialect({ database }) });

// search_path lets the raw SQL name tables unqualified, as it does on SQLite.
export const fromPostgres = (url) => (schema) => () => {
  const pool = new pg.Pool({
    connectionString: url,
    max: 4,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    application_name: "rocksky-auth-store",
    statement_timeout: 10_000,
  });
  pool.on("error", (err) => console.warn(`Idle pg client error on auth store: ${err.message}`));
  pool.on("connect", (client) => {
    client.query(`SET search_path TO "${schema}"`).catch(() => {});
  });
  return new Kysely({ dialect: new PostgresDialect({ pool }) });
};

export const rawImpl = (db) => (statement) => (params) => () => {
  const parts = statement.split("?");
  const strings = Object.assign([...parts], { raw: [...parts] });
  return sql(strings, ...params)
    .execute(db)
    .then((r) => r.rows ?? []);
};

export const transactionImpl = (db, f) => db.transaction().execute((tx) => f(tx));

export const migrateToLatestImpl = (db) => (migrations) => () => {
  const table = {};
  for (const m of migrations) {
    table[m.name] = {
      async up(k) {
        for (const s of m.up) await sql.raw(s).execute(k);
      },
      async down(k) {
        for (const s of m.down) await sql.raw(s).execute(k);
      },
    };
  }
  const migrator = new Migrator({ db, provider: { async getMigrations() { return table; } } });
  return migrator.migrateToLatest().then(({ error }) => {
    if (error) throw error;
  });
};

export const destroyImpl = (db) => () => db.destroy();
