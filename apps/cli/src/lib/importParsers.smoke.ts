/**
 * Smoke tests for the import parsers + the `import --dry-run` path. These never
 * touch the network or the PDS — they only exercise autodetection, parsing and
 * normalization against the fixtures in ./__fixtures__/import.
 *
 * Run with:  npx tsx src/lib/importParsers.smoke.ts
 */
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { detectFormat, parseCsv, parseImport } from "lib/importParsers";
import { ContiguousTracker, resumeIndex } from "lib/importCheckpoint";
import { importCmd } from "cmd/import";

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), "__fixtures__", "import");
const fix = (name: string) => path.join(FIX, name);

let passed = 0;
async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ✔ ${name}`);
  } catch (e) {
    console.error(`  ✖ ${name}\n    ${(e as Error).message}`);
    process.exitCode = 1;
  }
}

console.log("import parsers smoke tests\n");

await test("detectFormat autodetects spotify JSON", () => {
  assert.equal(detectFormat(fix("spotify-sample.json")), "spotify");
});

await test("detectFormat autodetects last.fm CSV", () => {
  assert.equal(detectFormat(fix("lastfm-sample.csv")), "lastfm");
});

await test("detectFormat autodetects last.fm JSON", () => {
  assert.equal(detectFormat(fix("lastfm-recenttracks.json")), "lastfm");
});

await test("parseCsv keeps commas inside quoted fields", () => {
  const rows = parseCsv('a,"b,c",d\n');
  assert.deepEqual(rows[0], ["a", "b,c", "d"]);
});

await test("spotify: skips podcasts and short plays, keeps real tracks", () => {
  const r = parseImport(fix("spotify-sample.json"));
  assert.equal(r.format, "spotify");
  assert.equal(r.scrobbles.length, 2);
  assert.equal(r.skipped["not-a-track"], 1);
  assert.equal(r.skipped["played-under-30s"], 1);
  // chronological order
  assert.ok(r.scrobbles[0].timestamp <= r.scrobbles[1].timestamp);
  assert.equal(r.scrobbles[0].title, "Tsy Maka Sarotra");
  assert.equal(r.scrobbles[0].artist, "Alien Xkai");
  assert.equal(r.scrobbles[0].album, "Ikotofetsy & Imahaka");
});

await test("spotify: --min-seconds 0 keeps the short play too", () => {
  const r = parseImport(fix("spotify-sample.json"), { minSeconds: 0 });
  assert.equal(r.scrobbles.length, 3);
});

await test("last.fm CSV: parses all rows, preserves comma-in-quotes artist", () => {
  const r = parseImport(fix("lastfm-sample.csv"));
  assert.equal(r.format, "lastfm");
  assert.equal(r.scrobbles.length, 4);
  const svea = r.scrobbles.find((s) => s.title === "Body Talk");
  assert.ok(svea, "expected the Ofenbach, Svea row");
  assert.equal(svea!.artist, "Ofenbach, Svea");
  // empty album / mbid must normalize to undefined, not ""
  const krit = r.scrobbles.find((s) => s.title === "Old News");
  assert.equal(krit!.album, undefined);
  assert.equal(krit!.mbId, undefined);
  // populated mbid is carried through
  const feather = r.scrobbles.find((s) => s.title === "Light as a Feather");
  assert.equal(feather!.mbId, "ac895a82-8d10-45b6-9b7e-80985cf40da6");
});

await test("last.fm JSON: skips now-playing, reads #text fields", () => {
  const r = parseImport(fix("lastfm-recenttracks.json"));
  assert.equal(r.format, "lastfm");
  assert.equal(r.scrobbles.length, 2);
  assert.equal(r.skipped["now-playing"], 1);
  const feather = r.scrobbles.find((s) => s.title === "Light as a Feather");
  assert.equal(feather!.artist, "Cannons");
});

await test("--format override forces the parser", () => {
  const r = parseImport(fix("lastfm-sample.csv"), { force: "lastfm" });
  assert.equal(r.format, "lastfm");
});

// The write-throttle + matchSong policy (and the *.bsky.network guard) now live
// in @rocksky/sdk and are covered by its own tests (sdk/typescript/src/
// agent.ratelimit.test.ts), which run without touching a real PDS/AppView.

await test("resumeIndex resumes right after the saved cursor", () => {
  const list = [
    { timestamp: 10, title: "a", artist: "x" },
    { timestamp: 20, title: "b", artist: "y" },
    { timestamp: 30, title: "c", artist: "z" },
  ];
  assert.equal(resumeIndex(list, null), 0);
  assert.equal(resumeIndex(list, { timestamp: 20, title: "b", artist: "y" }), 2);
  // unknown cursor (source changed) -> restart from the top, dedup still guards
  assert.equal(resumeIndex(list, { timestamp: 99, title: "?", artist: "?" }), 0);
});

await test("ContiguousTracker only advances across an unbroken prefix", () => {
  const t = new ContiguousTracker();
  assert.equal(t.complete(2), false); // out of order, no advance
  assert.equal(t.mark, -1);
  assert.equal(t.complete(0), true); // prefix now [0]
  assert.equal(t.mark, 0);
  assert.equal(t.complete(1), true); // prefix now [0,1,2]
  assert.equal(t.mark, 2);
});

await test("ContiguousTracker holds the mark behind a gap (failed index)", () => {
  const t = new ContiguousTracker();
  t.complete(0);
  t.complete(2); // index 1 failed -> never completed
  t.complete(3);
  assert.equal(t.mark, 0); // resume would retry from index 1
});

await test("import --dry-run parses without writing to the PDS", async () => {
  // No credentials are read and no Agent is created on the dry-run path.
  await importCmd(fix("spotify-sample.json"), { dryRun: true });
});

if (process.exitCode) {
  console.error(`\n✖ smoke tests failed`);
} else {
  console.log(`\n✔ ${passed} smoke tests passed`);
}
