// Source matching.test.ts scenarios against compiled PureScript.
import assert from "node:assert/strict";
import axios from "axios";
import { createHash } from "node:crypto";
import { fromAff } from "../output/Control.Promise/index.js";
import * as M from "../output/Rocksky.Lib.Matching/index.js";
const run = aff => fromAff(aff)();
const track = {
  source: "spotify", id: "2XQSgmtEY2titXhfY414dy", title: "Roygbiv",
  artists: ["Boards of Canada"], album: "Music Has the Right to Children",
  durationMs: 151000, identifiers: { spotifyTrackId: "2XQSgmtEY2titXhfY414dy", isrc: "GBBPW9800019" },
  trackNumber: 9, discNumber: 1,
};
function client(body) {
  return { matching: axios.create({ adapter: async config => ({ data: body, status: 200, statusText: "OK", headers: {}, config }) }) };
}
const request = await run(M.matchingRequest({ title: track.title, artist: track.artists[0], album: track.album }));
const match = (ctx, req = request, signal = null) => run(M.matchTrack(ctx)(req)(signal));
const input = await run(M.matchingRequest({
  title: "September", artist: "Earth, Wind & Fire", album: "The Best of Earth, Wind & Fire, Vol. 1",
  albumArtist: "Earth, Wind & Fire", duration: 215000, mbId: "recording-id", isrc: "US1234567890",
  spotifyLink: "https://open.spotify.com/track/2XQSgmtEY2titXhfY414dy?si=123",
}));
let sent;
await match({ matching: axios.create({ adapter: async config => {
  sent = JSON.parse(config.data);
  assert.equal(config.url, "/v1/match");
  return { data: { policyVersion: "1", status: "matched", track }, status: 200, statusText: "OK", headers: {}, config };
} }) }, input);
assert.deepEqual(sent.artists, ["Earth, Wind & Fire"]);
assert.equal(sent.album, input.album);
assert.equal(sent.albumArtist, input.albumArtist);
assert.equal(sent.durationMs, 215000);
assert.deepEqual(sent.identifiers, { musicbrainzRecordingId: "recording-id", isrc: "US1234567890", spotifyTrackId: track.id });
assert.deepEqual((await run(M.matchingRequest({ title: "Happy", artist: "C2C, Derek Martin", artists: [{ name: "C2C" }, { name: "Derek Martin" }] }))).artists, ["C2C", "Derek Martin"]);
const sparse = await run(M.matchingRequest({ title: "Song", artist: "Artist", album: " ", albumArtist: "", mbId: " ", duration: 1 }));
assert.deepEqual(sparse, { title: "Song", artists: ["Artist"], identifiers: {} });
for (const status of ["ambiguous", "unmatched"]) {
  assert.equal(await match(client({ policyVersion: "1", status, track: null, candidates: [{ track }] })), null);
}
const c = await match(client({ policyVersion: "1", status: "matched", track }));
assert.equal(c.id, track.id);
assert.equal(c.albumArt, undefined);
const meta = await run(M.candidateMetadata(c));
assert.equal(meta.trackNumber, 9);
assert.equal(meta.discNumber, 1);
assert.equal(meta.isrc, "GBBPW9800019");
assert.equal(meta.duration, 151000);
assert.equal(meta.spotifyLink, "https://open.spotify.com/track/" + track.id);
assert.equal(meta.releaseDate, undefined);
let calls = 0;
await assert.rejects(match({ matching: axios.create({ adapter: async () => { calls++; throw new Error("HTTP 503"); } }) }), /HTTP 503/);
assert.equal(calls, 1);
for (const response of [
  { policyVersion: "1", status: "matched", track: null },
  { policyVersion: "1", status: "ambiguous", track },
  { policyVersion: "1", status: "matched", track: { id: "broken" } },
  ...[{ artists: [] }, { providerScore: 101 }, { providerScore: Infinity }, { providerRank: 1.5 }].map(change => ({ policyVersion: "1", status: "matched", track: { ...track, ...change } })),
]) await assert.rejects(match(client(response)));
let called = false;
await assert.rejects(match({ matching: axios.create({ adapter: async () => { called = true; throw new Error("unexpected"); } }) }, request, AbortSignal.abort()));
assert.equal(called, false);
const r = { ...request, identifiers: { isrc: "GBBPW9800019" } };
const key = M.matchingCacheKey(r);
assert.equal(key, "matching:v1:" + createHash("sha256").update(JSON.stringify(r)).digest("hex"));
for (const change of [{ title: "wrong" }, { artists: ["wrong"] }, { album: "wrong" }, { albumArtist: "wrong" }, { durationMs: 1000 }, { identifiers: { isrc: "OTHER" } }]) {
  assert.notEqual(M.matchingCacheKey({ ...r, ...change }), key);
}
for (const value of [track.id, "spotify:track:" + track.id, "https://open.spotify.com/track/" + track.id + "?si=x"]) assert.equal(M.spotifyTrackId(value).value0, track.id);
for (const value of ["https://evil.example/track/" + track.id, "https://open.spotify.com/album/" + track.id, "1234"]) assert.equal(M.spotifyTrackId(value).constructor.name, "Nothing");
await assert.rejects(run(M.matchingRequest({ title: " ", artist: "x" })), /Matching requires/);
const withDate = await match(client({ policyVersion: "1", status: "matched", track: { ...track, releaseDate: "1998-04-20", albumArt: null } }));
const dated = await run(M.candidateMetadata(withDate));
assert.equal(dated.releaseDate.toISOString(), "1998-04-20T00:00:00.000Z");
assert.equal(dated.year, 1998);
assert.equal(dated.albumArt, null);
console.log("Verified matching constraints, ambiguity, metadata, cancellation, response validation and cache identity.");
