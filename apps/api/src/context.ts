import { createClient } from "auth/client";
import axios from "axios";
import { consola } from "consola";
import { createDb, migrateToLatest } from "db";
import drizzle from "drizzle";
import authVerifier from "lib/authVerifier";
import { env } from "lib/env";
import { createBidirectionalResolver, createIdResolver } from "lib/idResolver";
import { connect } from "nats";
import redis from "redis";
import sqliteKv from "sqliteKv";
import { createStorage } from "unstorage";

const { DB_PATH } = env;
export const db = createDb(DB_PATH);
await migrateToLatest(db);

const kv = createStorage({
  driver: sqliteKv({ location: env.KV_DB_PATH, table: "kv" }),
});

const baseIdResolver = createIdResolver(kv);

export const ctx = {
  oauthClient: await createClient(db),
  resolver: createBidirectionalResolver(baseIdResolver),
  baseIdResolver,
  kv: new Map<string, string>(),
  db: drizzle.db,
  nc: await connect({ servers: env.NATS_URL }),
  analytics: axios.create({ baseURL: env.ANALYTICS }),
  dropbox: axios.create({ baseURL: env.DROPBOX }),
  googledrive: axios.create({ baseURL: env.GOOGLE_DRIVE }),
  tracklist: axios.create({ baseURL: env.TRACKLIST }),
  musicbrainz: axios.create({ baseURL: env.MUSICBRAINZ_URL }),
  redis: await redis
    .createClient({ url: env.REDIS_URL })
    .on("error", (err) => {
      consola.error("Uncaught Redis Client Error", err);
      process.exit(1);
    })
    .connect(),
  meilisearch: axios.create({
    baseURL: env.MEILISEARCH_URL,
    headers: { Authorization: `Bearer ${env.MEILISEARCH_API_KEY}` },
  }),
  authVerifier,
  sqliteDb: db,
  sqliteKv: kv,
};

export type Context = typeof ctx;
