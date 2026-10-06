import { expect, it } from "bun:test";
import type { Context } from "context";
import type { SelectTrack } from "schema/tracks";
import { enrichmentSignal } from "./enrichmentBudget";
import { searchOnMusicBrainz } from "./musicbrainzEnrichment";

const track = {
  title: "Play My Music",
  artist: "Jonas Brothers",
  album: "Camp Rock Original Soundtrack",
} as SelectTrack;
const result = {
  trackMBID: "recording",
  artist: [{ mbid: "artist", name: "Jonas Brothers" }],
};

it("preserves the album-first lookup and falls back when the first call misses", async () => {
  const albums: unknown[] = [];
  const ctx = {
    musicbrainz: {
      post: async (_path: string, body: any) => {
        albums.push(body.album);
        return { data: albums.length === 1 ? null : result };
      },
    },
  } as unknown as Context;
  expect(await searchOnMusicBrainz(ctx, track)).toEqual({
    mbId: "recording",
    artists: [{ mbid: "artist", name: "Jonas Brothers" }],
  });
  expect(albums).toEqual([track.album, undefined]);
});

it("cancels the second hydrate at the shared deadline and preserves the found song", async () => {
  let calls = 0;
  let canceled = false;
  const parent = new AbortController();
  const signal = enrichmentSignal(parent.signal, 40);
  const ctx = {
    musicbrainz: {
      post: async (_path: string, _body: any, config: any) => {
        calls++;
        expect(config.signal).toBe(signal);
        if (calls === 1) return { data: null };
        return new Promise((_resolve, reject) => {
          config.signal.addEventListener(
            "abort",
            () => {
              canceled = true;
              reject(config.signal.reason);
            },
            { once: true },
          );
        });
      },
    },
  } as unknown as Context;
  const found = { ...track };
  const metadata = await searchOnMusicBrainz(ctx, found, undefined, signal);
  expect(metadata).toEqual({ mbId: null, artists: null });
  expect(found.title).toBe("Play My Music");
  expect(calls).toBe(2);
  expect(canceled).toBe(true);
  expect(parent.signal.aborted).toBe(false);
});

it("does not start another hydrate after cancellation, even if the adapter returns a miss", async () => {
  const parent = new AbortController();
  let calls = 0;
  const ctx = {
    musicbrainz: {
      post: async () => {
        calls++;
        parent.abort();
        return { data: null };
      },
    },
  } as unknown as Context;
  await searchOnMusicBrainz(
    ctx,
    track,
    undefined,
    enrichmentSignal(parent.signal),
  );
  expect(calls).toBe(1);
});

it("skips already-expired enrichment and avoids a duplicate search for an empty album", async () => {
  let calls = 0;
  const ctx = {
    musicbrainz: {
      post: async () => {
        calls++;
        return { data: null };
      },
    },
  } as unknown as Context;
  await searchOnMusicBrainz(ctx, track, undefined, AbortSignal.abort());
  expect(calls).toBe(0);
  await searchOnMusicBrainz(ctx, { ...track, album: "" });
  expect(calls).toBe(1);
});

it("passes the shared signal to recording-ID lookups", async () => {
  const signal = enrichmentSignal(new AbortController().signal);
  const ctx = {
    musicbrainz: {
      get: async (path: string, config: any) => {
        expect(path).toBe("/recording/id");
        expect(config.signal).toBe(signal);
        return { data: result };
      },
    },
  } as unknown as Context;
  expect((await searchOnMusicBrainz(ctx, track, "id", signal)).mbId).toBe(
    "recording",
  );
});
