// Copies OAuth sessions and state from atproto.sqlite into the Postgres auth
// store. Stop every process using either store first: a refresh written to
// SQLite after the copy leaves Postgres with a rotated refresh token, and
// using that revokes the user's session.
//
//   DB_PATH=/path/atproto.sqlite AUTH_DATABASE_URL=postgres://… \
//     node scripts/migrate_auth_to_postgres.mjs

import Database from "better-sqlite3";
import pg from "pg";

const { DB_PATH, AUTH_DATABASE_URL } = process.env;
if (!DB_PATH || !AUTH_DATABASE_URL) {
  console.error("DB_PATH and AUTH_DATABASE_URL are required");
  process.exit(1);
}

// Services are stopped while this runs, so a stalled connection must fail
// rather than wait: the caller falls back to SQLite on a non-zero exit.
setTimeout(() => {
  console.error("copy did not finish within 120s");
  process.exit(1);
}, 120_000).unref();

const sqlite = new Database(DB_PATH, { readonly: true, fileMustExist: true });
const sessions = sqlite.prepare("SELECT key, session, expiresAt FROM auth_session").all();
const states = sqlite.prepare("SELECT key, state FROM auth_state").all();
sqlite.close();

const client = new pg.Client({
  connectionString: AUTH_DATABASE_URL,
  connectionTimeoutMillis: 10_000,
  query_timeout: 60_000,
  statement_timeout: 60_000,
});
await client.connect();
try {
  await client.query("BEGIN");
  await client.query("CREATE SCHEMA IF NOT EXISTS atproto_auth");
  await client.query(
    'CREATE TABLE IF NOT EXISTS atproto_auth.auth_session (key text PRIMARY KEY, session text NOT NULL, "expiresAt" text)',
  );
  await client.query(
    "CREATE TABLE IF NOT EXISTS atproto_auth.auth_state (key text PRIMARY KEY, state text NOT NULL)",
  );
  // One statement per table: row-by-row inserts cost a round trip each to a
  // remote database.
  await client.query(
    `INSERT INTO atproto_auth.auth_session (key, session, "expiresAt")
     SELECT * FROM unnest($1::text[], $2::text[], $3::text[])
     ON CONFLICT (key) DO UPDATE SET session = excluded.session, "expiresAt" = excluded."expiresAt"`,
    [
      sessions.map((s) => s.key),
      sessions.map((s) => s.session),
      // apps/api's old default stored the string 'NULL' rather than NULL.
      sessions.map((s) => (s.expiresAt === "NULL" ? null : s.expiresAt)),
    ],
  );
  await client.query(
    `INSERT INTO atproto_auth.auth_state (key, state)
     SELECT * FROM unnest($1::text[], $2::text[])
     ON CONFLICT (key) DO UPDATE SET state = excluded.state`,
    [states.map((s) => s.key), states.map((s) => s.state)],
  );
  await client.query("COMMIT");
  const { rows } = await client.query("SELECT count(*)::int AS n FROM atproto_auth.auth_session");
  console.log(`copied ${sessions.length} sessions and ${states.length} states; postgres now holds ${rows[0].n} sessions`);
} catch (e) {
  await client.query("ROLLBACK").catch(() => {});
  throw e;
} finally {
  await client.end().catch(() => {});
}
process.exit(0);
