import SqliteDb from "better-sqlite3";
import chalk from "chalk";
import type { Context } from "context";
import {
  Kysely,
  type Migration,
  type MigrationProvider,
  Migrator,
  SqliteDialect,
} from "kysely";
import { createAgent } from "lib/agent";
import { consola } from "consola";

// Types

export type DatabaseSchema = {
  status: Status;
  auth_session: AuthSession;
  auth_state: AuthState;
};

export type Status = {
  uri: string;
  authorDid: string;
  status: string;
  createdAt: string;
  indexedAt: string;
};

export type AuthSession = {
  key: string;
  session: AuthSessionJson;
  expiresAt?: string | null;
};

export type AuthState = {
  key: string;
  state: AuthStateJson;
};

type AuthStateJson = string;

type AuthSessionJson = string;

// Migrations

const migrations: Record<string, Migration> = {};

const migrationProvider: MigrationProvider = {
  async getMigrations() {
    return migrations;
  },
};

migrations["001"] = {
  async up(db: Kysely<unknown>) {
    await db.schema
      .createTable("status")
      .addColumn("uri", "varchar", (col) => col.primaryKey())
      .addColumn("authorDid", "varchar", (col) => col.notNull())
      .addColumn("status", "varchar", (col) => col.notNull())
      .addColumn("createdAt", "varchar", (col) => col.notNull())
      .addColumn("indexedAt", "varchar", (col) => col.notNull())
      .execute();
    await db.schema
      .createTable("auth_session")
      .addColumn("key", "varchar", (col) => col.primaryKey())
      .addColumn("session", "varchar", (col) => col.notNull())
      .execute();
    await db.schema
      .createTable("auth_state")
      .addColumn("key", "varchar", (col) => col.primaryKey())
      .addColumn("state", "varchar", (col) => col.notNull())
      .execute();
  },
  async down(db: Kysely<unknown>) {
    await db.schema.dropTable("auth_state").execute();
    await db.schema.dropTable("auth_session").execute();
    await db.schema.dropTable("status").execute();
  },
};

migrations["002"] = {
  async up(db: Kysely<unknown>) {
    await db.schema
      .alterTable("auth_session")
      .addColumn("expiresAt", "text", (col) => col.defaultTo("NULL"))
      .execute();
  },
  async down(db: Kysely<unknown>) {
    await db.schema
      .alterTable("auth_session")
      .dropColumn("expiresAt")
      .execute();
  },
};

// APIs

export const createDb = (location: string): Database => {
  const database = new SqliteDb(location);

  // Two processes share this file — the XRPC service and the REST API — and
  // under the default rollback journal a writer takes an exclusive lock that
  // blocks every reader. The OAuth client reads `auth_session` on virtually
  // every authenticated request, and it cannot tell a locked file from a
  // deleted session: a failed read becomes "the session was deleted by another
  // process" and a 401, a failed write gets the refresh token revoked at the
  // PDS. WAL lets readers run straight through a concurrent write, which is
  // what keeps those two from ever being reached.
  database.pragma("journal_mode = WAL");
  database.pragma("busy_timeout = 5000");
  // WAL's default (FULL) fsyncs on every commit. NORMAL keeps the guarantee
  // that matters here — a crash cannot corrupt the file, only lose the last
  // commit or two, and a lost session refresh is re-fetched on next use.
  database.pragma("synchronous = NORMAL");

  return new Kysely<DatabaseSchema>({
    dialect: new SqliteDialect({ database }),
  });
};

export const migrateToLatest = async (db: Database) => {
  const migrator = new Migrator({ db, provider: migrationProvider });
  const { error } = await migrator.migrateToLatest();
  if (error) throw error;
};

export const updateExpiresAt = async (db: Database) => {
  // get all sessions that have expiresAt is null
  const sessions = await db.selectFrom("auth_session").selectAll().execute();
  consola.info("Found", sessions.length, "sessions to update");
  for (const session of sessions) {
    const data = JSON.parse(session.session) as {
      tokenSet: { expires_at?: string | null };
    };
    consola.info(session.key, data.tokenSet.expires_at);
    await db
      .updateTable("auth_session")
      .set({ expiresAt: data.tokenSet.expires_at })
      .where("key", "=", session.key)
      .execute();
  }

  consola.info(`Updated ${chalk.greenBright(sessions.length)} sessions`);
};

export const refreshSessionsAboutToExpire = async (
  db: Database,
  ctx: Context,
) => {
  const now = new Date().toISOString();

  const sessions = await db
    .selectFrom("auth_session")
    .selectAll()
    .where("expiresAt", "is not", "NULL")
    .where("expiresAt", ">", now)
    .orderBy("expiresAt", "asc")
    .execute();

  for (const session of sessions) {
    consola.info(
      "Session about to expire:",
      chalk.cyan(session.key),
      session.expiresAt,
    );
    const agent = await createAgent(ctx.oauthClient, session.key);
    // Trigger a token refresh by fetching preferences
    await agent.getPreferences();
    await new Promise((r) => setTimeout(r, 200));
  }

  consola.info(
    `Found ${chalk.yellowBright(sessions.length)} sessions to refresh`,
  );
};

export type Database = Kysely<DatabaseSchema>;
