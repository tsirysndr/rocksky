import { createHash } from "node:crypto";
import { expect, it } from "bun:test";
import { PgDialect } from "drizzle-orm/pg-core";
import type { Context } from "context";
import type { MatchedCandidate } from "lib/matching";
import tables from "schema";
import type { SelectTrack } from "schema/tracks";
import { catalogIdentity } from "./matchSongUris";

const candidate: MatchedCandidate = {
  source: "spotify",
  id: "provider-id",
  title: "Karma Police",
  artists: ["Radiohead"],
  album: "OK Computer",
  albumArtist: "Radiohead",
  durationMs: 264066,
  identifiers: { isrc: "GBAYE9701368" },
};
const record = {
  id: "catalog-id",
  sha256: "catalog-hash",
  title: "Karma Police",
  artist: "Radiohead",
  album: "OK Computer",
  albumArtist: "Radiohead",
  duration: 264000,
  isrc: "GBAYE9701368",
  uri: "at://did:plc:test/app.rocksky.song/song",
  albumUri: null,
  artistUri: null,
} as SelectTrack;
function context(track = record, failTrack = false) {
  const lookups: unknown[][] = [];
  const ctx = {
    readDb: {
      select: () => ({
        from: (table: unknown) => ({
          where: (where: any) => ({
            limit: async () => {
              const query = new PgDialect().sqlToQuery(where);
              lookups.push(query.params);
              expect(query.sql).toContain('"sha256"');
              if (table === tables.tracks) {
                if (failTrack) throw new Error("unavailable");
                return track ? [track] : [];
              }
              if (table === tables.albums)
                return [
                  {
                    title: "OK Computer",
                    artist: "Radiohead",
                    uri: "at://did:plc:test/app.rocksky.album/album",
                  },
                ];
              if (table === tables.artists)
                return [
                  {
                    name: "Radiohead",
                    uri: "at://did:plc:test/app.rocksky.artist/artist",
                  },
                ];
              throw new Error("unexpected table");
            },
          }),
        }),
      }),
    },
  } as unknown as Context;
  return { ctx, lookups };
}
it("fills catalog identity and independently stored album/artist URIs using indexed hashes", async () => {
  const { ctx, lookups } = context();
  const result = await catalogIdentity(ctx, candidate);
  expect(result.record?.id).toBe("catalog-id");
  expect(result.uri).toBe(record.uri);
  expect(result.albumUri).toBe("at://did:plc:test/app.rocksky.album/album");
  expect(result.artistUri).toBe("at://did:plc:test/app.rocksky.artist/artist");
  expect(lookups).toEqual(
    [
      "karma police - radiohead - ok computer",
      "ok computer - radiohead",
      "radiohead",
    ].map((value) => [createHash("sha256").update(value).digest("hex")]),
  );
});
for (const change of [
  { isrc: "OTHER" },
  { title: "Different song" },
  { album: "OK Computer (Remastered)" },
  { duration: 300000 },
]) {
  it(`does not attach a conflicting catalog song: ${JSON.stringify(change)}`, async () => {
    const { ctx } = context({ ...record, ...change });
    const result = await catalogIdentity(ctx, candidate);
    expect(result.record).toBeUndefined();
    expect(result.uri).toBeNull();
    expect(result.albumUri).not.toBeNull();
    expect(result.artistUri).not.toBeNull();
  });
}
it("keeps available artist and album references when the song lookup fails", async () => {
  const { ctx } = context(record, true);
  const result = await catalogIdentity(ctx, candidate);
  expect(result.record).toBeUndefined();
  expect(result.uri).toBeNull();
  expect(result.albumUri).not.toBeNull();
  expect(result.artistUri).not.toBeNull();
});
it("does not use a catalog track's original album URI for a joined release", async () => {
  const { ctx } = context();
  const result = await catalogIdentity(
    ctx,
    { ...candidate, album: "Compilation" },
    { ...record, albumUri: "at://did:plc:test/app.rocksky.album/original" },
  );
  expect(result.uri).toBe(record.uri);
  expect(result.albumUri).toBeNull();
});
