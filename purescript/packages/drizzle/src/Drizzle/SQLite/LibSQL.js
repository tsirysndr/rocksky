import { drizzle } from "drizzle-orm/libsql";

// url ":memory:", "file:local.db" or a Turso "libsql://..." URL.
export const openImpl = (cfg) => () =>
  drizzle({
    connection: cfg.authToken === null ? { url: cfg.url } : { url: cfg.url, authToken: cfg.authToken },
  });
export const closeImpl = (db) => () => Promise.resolve(db.$client.close()).then(() => undefined);
