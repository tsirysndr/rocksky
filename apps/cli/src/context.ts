import drizzle from "./drizzle";
import sqliteKv from "sqliteKv";
import { createBidirectionalResolver, createIdResolver } from "lib/idResolver";
import { createStorage } from "unstorage";
import envpaths from "env-paths";
import fs from "node:fs";

fs.mkdirSync(envpaths("rocksky", { suffix: "" }).data, { recursive: true });
const kvPath = `${envpaths("rocksky", { suffix: "" }).data}/rocksky-kv.sqlite`;

const kv = createStorage({
  driver: sqliteKv({ location: kvPath, table: "kv" }),
});

const baseIdResolver = createIdResolver(kv);

export const ctx = {
  db: drizzle.db,
  resolver: createBidirectionalResolver(baseIdResolver),
  baseIdResolver,
  kv,
};

export type Context = typeof ctx;
