import assert from "node:assert/strict";
import test from "node:test";
import { songRecordUri } from "../src/lib/songRecordUri.ts";
const song = "at://did:plc:artist/app.rocksky.song/song1";
const scrobble = "at://did:plc:listener/app.rocksky.scrobble/play1";
test("scrobble listeners use the underlying song rather than the play record", () => {
  assert.equal(
    songRecordUri({ uri: scrobble, trackUri: song }, scrobble),
    song,
  );
});
test("songs can load listeners from their route before metadata arrives", () => {
  assert.equal(songRecordUri(undefined, song), song);
  assert.equal(songRecordUri({ uri: song }), song);
});
test("unresolved scrobbles do not send an incorrect listener query", () => {
  assert.equal(songRecordUri(undefined, scrobble), "");
  assert.equal(songRecordUri({ uri: scrobble, trackUri: null }, scrobble), "");
  assert.equal(songRecordUri({ uri: "" }), "");
});
