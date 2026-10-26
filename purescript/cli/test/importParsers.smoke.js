import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { detectFormat, parseCsv, parseImport } from "../runtime/lib/importParsers.js";
import { ContiguousTracker, resumeIndex } from "../runtime/lib/importCheckpoint.js";
import { importCmd } from "../runtime/cmd/import.js";
const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), "__fixtures__", "import");
const fix = (name) => path.join(FIX, name);
let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  \u2714 ${name}`);
  } catch (e) {
    console.error(`  \u2716 ${name}
    ${e.message}`);
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
  assert.equal(svea.artist, "Ofenbach, Svea");
  const krit = r.scrobbles.find((s) => s.title === "Old News");
  assert.equal(krit.album, void 0);
  assert.equal(krit.mbId, void 0);
  const feather = r.scrobbles.find((s) => s.title === "Light as a Feather");
  assert.equal(feather.mbId, "ac895a82-8d10-45b6-9b7e-80985cf40da6");
});
await test("last.fm JSON: skips now-playing, reads #text fields", () => {
  const r = parseImport(fix("lastfm-recenttracks.json"));
  assert.equal(r.format, "lastfm");
  assert.equal(r.scrobbles.length, 2);
  assert.equal(r.skipped["now-playing"], 1);
  const feather = r.scrobbles.find((s) => s.title === "Light as a Feather");
  assert.equal(feather.artist, "Cannons");
});
await test("--format override forces the parser", () => {
  const r = parseImport(fix("lastfm-sample.csv"), { force: "lastfm" });
  assert.equal(r.format, "lastfm");
});
await test("resumeIndex resumes right after the saved cursor", () => {
  const list = [
    { timestamp: 10, title: "a", artist: "x" },
    { timestamp: 20, title: "b", artist: "y" },
    { timestamp: 30, title: "c", artist: "z" }
  ];
  assert.equal(resumeIndex(list, null), 0);
  assert.equal(resumeIndex(list, { timestamp: 20, title: "b", artist: "y" }), 2);
  assert.equal(resumeIndex(list, { timestamp: 99, title: "?", artist: "?" }), 0);
});
await test("ContiguousTracker only advances across an unbroken prefix", () => {
  const t = new ContiguousTracker();
  assert.equal(t.complete(2), false);
  assert.equal(t.mark, -1);
  assert.equal(t.complete(0), true);
  assert.equal(t.mark, 0);
  assert.equal(t.complete(1), true);
  assert.equal(t.mark, 2);
});
await test("ContiguousTracker holds the mark behind a gap (failed index)", () => {
  const t = new ContiguousTracker();
  t.complete(0);
  t.complete(2);
  t.complete(3);
  assert.equal(t.mark, 0);
});
await test("import --dry-run parses without writing to the PDS", async () => {
  await importCmd(fix("spotify-sample.json"), { dryRun: true });
});
if (process.exitCode) {
  console.error(`
\u2716 smoke tests failed`);
} else {
  console.log(`
\u2714 ${passed} smoke tests passed`);
}
