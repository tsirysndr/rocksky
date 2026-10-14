import assert from "node:assert/strict";
import { describe, expect, it } from "bun:test";
import axios from "axios";
import {
  candidateMetadata,
  matchingCacheKey,
  matchingRequest,
  matchTrack,
  spotifyTrackId,
} from "./matching";

const track = {
  source: "spotify",
  id: "2XQSgmtEY2titXhfY414dy",
  title: "Roygbiv",
  artists: ["Boards of Canada"],
  album: "Music Has the Right to Children",
  durationMs: 151000,
  identifiers: {
    spotifyTrackId: "2XQSgmtEY2titXhfY414dy",
    isrc: "GBBPW9800019",
  },
  trackNumber: 9,
  discNumber: 1,
};
const request = matchingRequest({
  title: track.title,
  artist: track.artists[0],
  album: track.album,
});
function client(body: unknown, status = 200) {
  return {
    matching: axios.create({
      adapter: async (config) => ({
        data: body,
        status,
        statusText: "OK",
        headers: {},
        config,
      }),
    }),
  };
}
describe("central matching client", () => {
  it("forwards every supplied constraint and ID without splitting band names", async () => {
    const input = matchingRequest({
      title: "September",
      artist: "Earth, Wind & Fire",
      album: "The Best of Earth, Wind & Fire, Vol. 1",
      albumArtist: "Earth, Wind & Fire",
      duration: 215000,
      mbId: "recording-id",
      isrc: "US1234567890",
      spotifyLink:
        "https://open.spotify.com/track/2XQSgmtEY2titXhfY414dy?si=123",
    });
    let sent: any;
    const ctx = {
      matching: axios.create({
        adapter: async (config) => {
          sent = JSON.parse(config.data);
          expect(config.url).toBe("/v1/match");
          return {
            data: { policyVersion: "1", status: "matched", track },
            status: 200,
            statusText: "OK",
            headers: {},
            config,
          };
        },
      }),
    };
    await matchTrack(ctx, input);
    expect(sent.artists).toEqual(["Earth, Wind & Fire"]);
    expect(sent.album).toBe(input.album);
    expect(sent.albumArtist).toBe(input.albumArtist);
    expect(sent.durationMs).toBe(215000);
    expect(sent.identifiers).toEqual({
      musicbrainzRecordingId: "recording-id",
      isrc: "US1234567890",
      spotifyTrackId: track.id,
    });
  });
  it("uses structured credits when available", () => {
    expect(
      matchingRequest({
        title: "Happy",
        artist: "C2C, Derek Martin",
        artists: [{ name: "C2C" }, { name: "Derek Martin" }],
      }).artists,
    ).toEqual(["C2C", "Derek Martin"]);
  });
  it("omits unknown optional fields and placeholder durations", () => {
    const r = matchingRequest({
      title: "Song",
      artist: "Artist",
      album: " ",
      albumArtist: "",
      mbId: " ",
      duration: 1,
    });
    expect(r.album).toBe(undefined);
    expect(r.albumArtist).toBe(undefined);
    expect(r.durationMs).toBe(undefined);
    expect(r.identifiers?.musicbrainzRecordingId).toBe(undefined);
  });
  for (const status of ["ambiguous", "unmatched"]) {
    it(`does not select a candidate for ${status}`, async () => {
      expect(
        await matchTrack(
          client({
            policyVersion: "1",
            status,
            track: null,
            candidates: [{ track }],
          }),
          request,
        ),
      ).toBe(null);
    });
  }
  it("returns the selected candidate and preserves provider metadata", async () => {
    const c = await matchTrack(
      client({ policyVersion: "1", status: "matched", track }),
      request,
    );
    expect(c?.id).toBe(track.id);
    expect(candidateMetadata(c!)).toMatchObject({
      trackNumber: 9,
      discNumber: 1,
      isrc: "GBBPW9800019",
      duration: 151000,
    });
  });
  it("does not turn service failures into a miss or try another provider", async () => {
    let calls = 0;
    const ctx = {
      matching: axios.create({
        adapter: async () => {
          calls++;
          throw new Error("HTTP 503");
        },
      }),
    };
    await assert.rejects(matchTrack(ctx, request), /HTTP 503/);
    expect(calls).toBe(1);
  });
  it("rejects inconsistent and malformed service responses", async () => {
    for (const response of [
      { policyVersion: "1", status: "matched", track: null },
      { policyVersion: "1", status: "ambiguous", track },
      { policyVersion: "1", status: "matched", track: { id: "broken" } },
    ])
      await assert.rejects(matchTrack(client(response), request));
  });
  it("honors cancellation before sending any request", async () => {
    let called = false;
    const ctx = {
      matching: axios.create({
        adapter: async () => {
          called = true;
          throw new Error("unexpected");
        },
      }),
    };
    await assert.rejects(matchTrack(ctx, request, AbortSignal.abort()));
    expect(called).toBe(false);
  });
  it("keys any cache by every constraint, even with an explicit ID", () => {
    const r = { ...request, identifiers: { isrc: "GBBPW9800019" } };
    const key = matchingCacheKey(r);
    for (const change of [
      { title: "Wrong title" },
      { artists: ["Wrong artist"] },
      { album: "Wrong album" },
      { albumArtist: "Wrong album artist" },
      { durationMs: 1000 },
      { identifiers: { isrc: "OTHER" } },
    ]) {
      assert.notEqual(matchingCacheKey({ ...r, ...change }), key);
    }
  });
  it("accepts Spotify IDs, URLs and URIs, but rejects unrelated URLs", () => {
    for (const value of [
      track.id,
      `spotify:track:${track.id}`,
      `https://open.spotify.com/track/${track.id}?si=x`,
    ])
      expect(spotifyTrackId(value)).toBe(track.id);
    for (const value of [
      `https://evil.example/track/${track.id}`,
      `https://open.spotify.com/album/${track.id}`,
      "1234",
    ])
      expect(spotifyTrackId(value)).toBe(undefined);
  });
});
