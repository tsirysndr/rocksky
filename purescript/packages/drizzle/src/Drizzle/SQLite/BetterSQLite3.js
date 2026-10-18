// better-sqlite3 is a native Node.js addon that Bun cannot load, so it and
// drizzle's adapter are imported lazily: this module can be loaded under Bun,
// only `open` fails there.
export const available = () => typeof Bun === "undefined";

export const openImpl = (filename) => () =>
  Promise.all([import("better-sqlite3"), import("drizzle-orm/better-sqlite3")]).then(
    ([{ default: Database }, { drizzle }]) => drizzle(new Database(filename))
  );

export const closeImpl = (db) => () => Promise.resolve(db.$client.close()).then(() => undefined);
