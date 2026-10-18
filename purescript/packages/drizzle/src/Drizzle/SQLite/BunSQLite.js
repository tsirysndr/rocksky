// Both `bun:sqlite` and drizzle's bun-sqlite adapter (which imports it) are
// loaded lazily so this module can be imported under Node.js; only calling
// `open` requires Bun.
export const available = () => typeof Bun !== "undefined";

export const openImpl = (filename) => () =>
  Promise.all([import("bun:sqlite"), import("drizzle-orm/bun-sqlite")]).then(
    ([{ Database }, { drizzle }]) => drizzle(new Database(filename))
  );

export const closeImpl = (db) => () => Promise.resolve(db.$client.close()).then(() => undefined);
