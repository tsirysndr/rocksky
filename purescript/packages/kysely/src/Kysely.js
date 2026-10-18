import { Kysely, Migrator, SqliteDialect, sql } from "kysely";

export const fromSqlite = (database) => () => new Kysely({ dialect: new SqliteDialect({ database }) });

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
