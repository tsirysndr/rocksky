import { createClient } from "auth/client";
import { createDb, migrateToLatest } from "db";
import { env } from "lib/env";
import { createBidirectionalResolver, createIdResolver } from "lib/idResolver";
import sqliteKv from "sqliteKv";
import { createStorage } from "unstorage";
import { getXataClient } from "xata";

const { DB_PATH } = env;
export const db = createDb(DB_PATH);
await migrateToLatest(db);

const kv = createStorage({
  driver: sqliteKv({ location: env.KV_DB_PATH, table: "kv" }),
});

const baseIdResolver = createIdResolver(kv);

const client = getXataClient();

export const ctx = {
  oauthClient: await createClient(db),
  resolver: createBidirectionalResolver(baseIdResolver),
  kv: new Map<string, string>(),
  client,
};

export type Context = typeof ctx;
