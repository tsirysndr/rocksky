import drizzle from "./drizzle.js";
import sqliteKv from "./sqliteKv.js";
import { createBidirectionalResolver, createIdResolver } from "./lib/idResolver.js";
import { createStorage } from "unstorage";
import envpaths from "env-paths";
import fs from "node:fs";
fs.mkdirSync(envpaths("rocksky", { suffix: "" }).data, { recursive: true });
const kvPath = `${envpaths("rocksky", { suffix: "" }).data}/rocksky-kv.sqlite`;
const kv = createStorage({
  driver: sqliteKv({ location: kvPath, table: "kv" })
});
const baseIdResolver = createIdResolver(kv);
const ctx = {
  db: drizzle.db,
  resolver: createBidirectionalResolver(baseIdResolver),
  baseIdResolver,
  kv
};
export {
  ctx
};
