import drizzle from "./drizzle.ts";

export const ctx = {
  db: drizzle.db,
};

export type Context = typeof ctx;
