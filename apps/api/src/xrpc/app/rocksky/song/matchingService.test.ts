import assert from "node:assert/strict";
import { expect, it } from "bun:test";
import axios from "axios";
import type { Context } from "context";
import tables from "schema";
import { retrieveMatch } from "./matchSong";

const params = {
  title: "Roygbiv",
  artist: "Boards of Canada",
  album: "Music Has the Right to Children",
  isrc: "GBBPW9800019",
};
const candidate = {
  source: "spotify",
  id: "2XQSgmtEY2titXhfY414dy",
  title: params.title,
  artists: [params.artist],
  album: params.album,
  identifiers: { isrc: params.isrc, spotifyTrackId: "2XQSgmtEY2titXhfY414dy" },
  durationMs: 151000,
  trackNumber: 9,
  discNumber: 1,
};
function context(
  status: string,
  track: unknown,
  candidates: unknown[] = [candidate],
) {
  return {
    matching: axios.create({
      adapter: async (config) => {
        expect(JSON.parse(config.data)).toMatchObject({
          title: params.title,
          artists: [params.artist],
          album: params.album,
          identifiers: { isrc: params.isrc },
        });
        return {
          data: {
            policyVersion: "1",
            status,
            track,
            candidates: candidates.map((track) => ({ track })),
            rejected: [{ track: { ...candidate, title: "Wrong song" } }],
          },
          status: 200,
          statusText: "OK",
          headers: {},
          config,
        };
      },
    }),
    // Neither a catalog shortcut nor a legacy Redis hit may bypass matching.
    readDb: {
      select() {
        return { from: () => ({ where: () => ({ limit: async () => [] }) }) };
      },
    },
    redis: {
      get() {
        throw new Error("legacy cache must not be used");
      },
    },
  } as unknown as Context;
}
it("maps the selected service result to the existing song response", async () => {
  const result = await retrieveMatch(context("matched", candidate), params);
  expect(result).toMatchObject({
    title: params.title,
    artist: params.artist,
    album: params.album,
    isrc: params.isrc,
    duration: 151000,
    trackNumber: 9,
    discNumber: 1,
    playCount: 0,
    uniqueListeners: 0,
    matches: [
      { source: "spotify", providerId: candidate.id, title: params.title },
    ],
  });
  expect(result.spotifyLink).toBe(
    `https://open.spotify.com/track/${candidate.id}`,
  );
});
for (const status of ["ambiguous", "unmatched"]) {
  it(`returns NotFound for ${status} without choosing a candidate`, async () => {
    await assert.rejects(
      retrieveMatch(context(status, null), params),
      /No unambiguous song match/,
    );
  });
}
it("propagates service outages without fallback matching", async () => {
  const ctx = context("matched", candidate);
  ctx.matching = axios.create({
    adapter: async () => {
      throw new Error("HTTP 503");
    },
  });
  await assert.rejects(retrieveMatch(ctx, params), /HTTP 503/);
});

it("returns Deezer and MusicBrainz candidates without changing the selected identity", async () => {
  const mbId = "363ee5f9-0855-4c64-842d-d8be1ec59f1e";
  const mbArtists = [{ mbid: "artist-id", name: params.artist }];
  const deezer = {
    ...candidate,
    source: "deezer",
    id: "12345",
    providerScore: 0.87 * 100,
    providerRank: 307167,
    providerLink: "https://www.deezer.com/track/12345?provider=original",
    preview: "https://cdnt-preview.dzcdn.net/preview.mp3?signature=original",
    identifiers: { deezerTrackId: "12345", isrc: params.isrc },
  };
  const mb = {
    ...candidate,
    source: "musicbrainz",
    id: mbId,
    identifiers: { musicbrainzRecordingId: mbId },
    musicbrainzArtists: mbArtists,
  };
  const result = await retrieveMatch(
    context("matched", candidate, [
      candidate,
      deezer,
      mb,
      { ...candidate, source: "catalog" },
    ]),
    params,
  );
  expect(result.matches).toHaveLength(3);
  expect(result.matches?.[1]).toMatchObject({
    source: "deezer",
    id: 12345,
    providerId: "12345",
    link: "https://www.deezer.com/track/12345?provider=original",
    preview: "https://cdnt-preview.dzcdn.net/preview.mp3?signature=original",
    isrc: params.isrc,
  });
  expect(result.matches?.[2]).toMatchObject({
    source: "musicbrainz",
    providerId: mbId,
    mbId,
    mbArtists,
    link: `https://musicbrainz.org/recording/${mbId}`,
  });
  expect(result.matches?.[2].id).toBeUndefined();
  expect(result.matches?.[1].score).toBe(87);
  expect(result.matches?.[1].rank).toBe(307167);
  expect(result.matches?.[0].score).toBeUndefined();
  expect(result.mbId).toBeNull();
  expect(result.mbArtists).toBeNull();
  expect(result.spotifyLink).toBe(
    `https://open.spotify.com/track/${candidate.id}`,
  );
});

it("fills the catalog ID and references for an external selection and counts that record", async () => {
  const ctx = context("matched", candidate);
  const uri = "at://did:plc:test/app.rocksky.song/song";
  ctx.readDb = {
    select: () => ({
      from: (table: unknown) => ({
        where: () => {
          if (table === tables.userTracks || table === tables.scrobbles)
            return Promise.resolve([
              { count: table === tables.userTracks ? 2 : 7 },
            ]);
          return {
            limit: async () =>
              table === tables.tracks
                ? [
                    {
                      id: "rocksky-id",
                      lyrics: "Stored lyrics",
                      composer: "Stored composer",
                      bpm: 120,
                      key: "A minor",
                      label: "Stored label",
                      mbId: "catalog-mbid",
                      spotifyLink: null,
                      youtubeLink: "https://www.youtube.com/watch?v=stored",
                      albumArt: "https://example.com/catalog.jpg",
                      genre: "Electronic, Ambient",
                      createdAt: new Date("2020-01-01T00:00:00Z"),
                      sha256: "hash",
                      title: candidate.title,
                      artist: params.artist,
                      album: params.album,
                      albumArtist: params.artist,
                      isrc: params.isrc,
                      duration: 151000,
                      uri,
                      albumUri: "at://did:plc:test/app.rocksky.album/album",
                      artistUri: "at://did:plc:test/app.rocksky.artist/artist",
                    },
                  ]
                : [],
          };
        },
      }),
    }),
  } as unknown as Context["readDb"];
  const result = await retrieveMatch(ctx, params);
  expect(result).toMatchObject({
    id: "rocksky-id",
    lyrics: "Stored lyrics",
    composer: "Stored composer",
    bpm: 120,
    key: "A minor",
    label: "Stored label",
    mbId: "catalog-mbid",
    youtubeLink: "https://www.youtube.com/watch?v=stored",
    albumArt: "https://example.com/catalog.jpg",
    genres: ["Electronic", "Ambient"],
    createdAt: "2020-01-01T00:00:00.000Z",
    sha256: "hash",
    uri,
    albumUri: "at://did:plc:test/app.rocksky.album/album",
    artistUri: "at://did:plc:test/app.rocksky.artist/artist",
    uniqueListeners: 2,
    playCount: 7,
  });
  expect(result.spotifyLink).toBe(
    `https://open.spotify.com/track/${candidate.id}`,
  );
});
