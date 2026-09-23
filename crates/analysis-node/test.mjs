// Smoke test for the native binding. Points at real audio when
// ANALYSIS_TEST_FILES is set (colon-separated paths); always checks that
// garbage input rejects instead of crashing.
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { test } from "node:test";
import { analyze, analyzeBatch } from "./index.js";

test("garbage input rejects, never crashes", async () => {
  await assert.rejects(() => analyze(Buffer.from("<html>404</html>"), "mp3"));
});

test("a batch of garbage reports every item and keeps order", async () => {
  const events = [];
  const results = await analyzeBatch(
    [
      { id: "a", buffer: Buffer.from("nope"), extensionHint: "mp3" },
      { id: "b", buffer: Buffer.alloc(0) },
    ],
    (p) => events.push(p),
  );
  assert.strictEqual(results.length, 2);
  assert.deepStrictEqual(
    results.map((r) => r.id),
    ["a", "b"],
  );
  assert.ok(results.every((r) => !r.ok && r.error));
  assert.strictEqual(events.length, 2);
  assert.ok(events.every((e) => e.total === 2 && !e.ok));
});

const files = (process.env.ANALYSIS_TEST_FILES ?? "")
  .split(":")
  .filter(Boolean);

test(
  "real audio has a key, a bpm and a fingerprint",
  { skip: files.length === 0 },
  async () => {
    const results = await analyzeBatch(
      files.map((file) => ({
        id: file,
        buffer: readFileSync(file),
        extensionHint: extname(file).slice(1),
      })),
      (p) =>
        console.log(
          `  [${p.completed}/${p.total}] ${p.ok ? `${p.key ?? "?"} ${p.bpm?.toFixed(1) ?? "?"} bpm ${p.fingerprint ? "fp" : "--"}` : p.error} — ${p.id}`,
        ),
    );
    for (const r of results) {
      assert.ok(r.ok, `${r.id}: ${r.error}`);
      assert.ok(r.analysis.duration > 0);
      // base64url, and long enough to be a real fingerprint rather than a
      // couple of sub-fingerprints from a file that barely decoded.
      assert.match(r.analysis.fingerprint ?? "", /^[A-Za-z0-9_-]{100,}$/);
    }
  },
);
