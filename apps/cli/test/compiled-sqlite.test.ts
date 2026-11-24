import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import Database from "../scripts/bun-sqlite-compat";

const adapter = resolve(import.meta.dir, "../scripts/bun-sqlite-compat.ts");

test("compiled SQLite translates file creation, existing-file and readonly modes", () => {
  const temp = mkdtempSync(join(tmpdir(), "rocksky-sqlite-"));
  try {
    const filename = join(temp, "cache.sqlite");
    expect(() => new Database(filename, { fileMustExist: true })).toThrow();
    const db = new Database(filename, { fileMustExist: false });
    expect(db.pragma("journal_mode = WAL", { simple: true })).toBe("wal");
    db.exec("CREATE TABLE cache (value TEXT)");
    db.prepare("INSERT INTO cache VALUES (?)").run("persisted");
    db.close();
    const reader = new Database(filename, {
      readonly: true,
      fileMustExist: true,
    });
    expect(reader.prepare("SELECT value FROM cache").get()).toEqual({
      value: "persisted",
    });
    expect(() => reader.exec("DELETE FROM cache")).toThrow();
    reader.close();
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

for (const variant of ["typescript", "purescript"]) {
  test(`${variant} compiled cache reads, updates, persists and deletes through Kysely`, async () => {
    const temp = mkdtempSync(join(tmpdir(), "rocksky-compiled-cache-"));
    try {
      const driver = resolve(
        import.meta.dir,
        variant === "typescript"
          ? "../src/sqliteKv.ts"
          : "../../../purescript/cli/runtime/sqliteKv.js",
      );
      const entry = join(temp, "entry.ts");
      writeFileSync(
        entry,
        `
        import sqliteKv from ${JSON.stringify(driver)};
        import assert from "node:assert/strict";
        const location = ${JSON.stringify(join(temp, "cache.sqlite"))};
        let cache = sqliteKv({location, table:"kv"});
        assert.equal(await cache.getItem("missing"), null);
        await cache.setItem("song", "first");
        assert.equal(await cache.getItem("song"), "first");
        await cache.setItem("song", "updated");
        await cache.setItems([{key:"other",value:"second"}]);
        assert.equal(await cache.hasItem("song"), true);
        assert.deepEqual((await cache.getKeys()).sort(), ["other","song"]);
        await cache.dispose();
        cache = sqliteKv({location, table:"kv"});
        assert.equal(await cache.getItem("song"), "updated");
        await cache.removeItem("song");
        assert.equal(await cache.hasItem("song"), false);
        await cache.clear();
        assert.deepEqual(await cache.getKeys(), []);
        await cache.dispose();
      `,
      );
      const build = await Bun.build({
        entrypoints: [entry],
        target: "bun",
        outdir: temp,
        plugins: [
          {
            name: "compiled-sqlite",
            setup(builder) {
              builder.onResolve({ filter: /^better-sqlite3$/ }, () => ({
                path: adapter,
              }));
            },
          },
        ],
      });
      expect(build.success).toBe(true);
      const run = Bun.spawnSync([process.execPath, join(temp, "entry.js")]);
      expect({ status: run.exitCode, stderr: run.stderr.toString() }).toEqual({
        status: 0,
        stderr: "",
      });
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });
}
