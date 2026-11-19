import { describe, expect, test, spyOn } from "bun:test";
import type { Context } from "../src/context";
import { createSubmittedNowPlaying } from "../src/lib/submittedNowPlaying";

const submitted = JSON.stringify({
  inserted_at: 1700000000,
  track_metadata: {
    track_name: "Song",
    artist_name: "Artist",
    release_name: "Album",
  },
});
function setup(row?: Record<string, unknown>, status = "unmatched") {
  let queries = 0;
  let calls = 0;
  const candidate = {
    source: "spotify",
    id: "id",
    title: "Song",
    artists: ["Artist"],
    album: "Album",
    albumArt: "https://art.test/provider.jpg",
    durationMs: 20000,
    identifiers: {},
  };
  const query = {
    from() {
      return query;
    },
    where() {
      return query;
    },
    async limit() {
      queries++;
      return row ? [row] : [];
    },
  };
  const ctx = {
    redis: {
      async get() {
        return submitted;
      },
    },
    db: {
      select() {
        return query;
      },
    },
    matching: {
      async post(
        _url: string,
        _body: unknown,
        config: { signal: AbortSignal },
      ) {
        calls++;
        expect(config.signal).toBeInstanceOf(AbortSignal);
        if (status === "error") throw new Error("offline");
        return {
          data: {
            policyVersion: "1",
            status,
            track: status === "matched" ? candidate : null,
            candidates: [],
            warnings: [],
          },
        };
      },
    },
  } as unknown as Context;
  return {
    read: createSubmittedNowPlaying(ctx),
    queries: () => queries,
    calls: () => calls,
  };
}

describe("submitted now-playing metadata", () => {
  test("uses catalog artwork and links, caches metadata and advances playback", async () => {
    let now = 1700000010000;
    const clock = spyOn(Date, "now").mockImplementation(() => now);
    try {
      const api = setup({
        albumArt: "https://art.test/catalog.jpg",
        albumArtist: "Album Artist",
        duration: 20000,
        uri: "at://song",
        albumUri: "at://album",
        artistUri: "at://artist",
      });
      expect(await api.read("did:test")).toMatchObject({
        title: "Song",
        album: "Album",
        album_art: "https://art.test/catalog.jpg",
        song_uri: "at://song",
        album_artist: "Album Artist",
        length: 20000,
        elapsed: 10000,
      });
      now += 1000;
      expect(await api.read("did:test")).toMatchObject({ elapsed: 11000 });
      expect(api.queries()).toBe(1);
      expect(api.calls()).toBe(0);
    } finally {
      clock.mockRestore();
    }
  });
  test("uses accepted provider artwork and preserves playback on ambiguity or failure", async () => {
    for (const status of ["matched", "ambiguous", "error"]) {
      const api = setup(undefined, status);
      expect(await api.read("did:test")).toMatchObject({
        title: "Song",
        album_art:
          status === "matched" ? "https://art.test/provider.jpg" : null,
        is_playing: true,
      });
    }
  });
});
