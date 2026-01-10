import drizzle from "./drizzle";
import sqliteKv from "sqliteKv";
import { createBidirectionalResolver, createIdResolver } from "lib/idResolver";
import { createStorage } from "unstorage";

const kv = createStorage({
  driver: sqliteKv({ location: ":memory:", table: "kv" }),
});

const baseIdResolver = createIdResolver(kv);

export const ctx = {
  db: drizzle.db,
  resolver: createBidirectionalResolver(baseIdResolver),
  baseIdResolver,
};

export type Context = typeof ctx;
