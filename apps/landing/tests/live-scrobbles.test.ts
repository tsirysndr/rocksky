import { describe, expect, test } from "bun:test";
import { liveScrobbles, scrobbleKey } from "../src/live-scrobbles";

const joined = (id: string, date: string) => ({
  scrobbles: {
    id,
    uri: `at://did:plc:listener/app.rocksky.scrobble/${id}`,
    timestamp: date,
  },
  tracks: {
    uri: "at://did:plc:artist/app.rocksky.song/song",
    title: "Chaser",
    artist: "Calibro 35",
    album: "Jazzploitation",
    albumArt: "https://example.com/cover.jpg",
  },
  users: {
    did: "did:plc:listener",
    handle: "listener.test",
    avatar: "https://example.com/avatar.jpg",
  },
});

describe("live scrobble updates", () => {
  test("maps websocket joined rows to the public feed model and keeps the newest first", () => {
    const tracks = liveScrobbles({
      scrobbles: [
        joined("old", "2026-11-23T12:00:00Z"),
        joined("new", "2026-11-23T12:01:00Z"),
      ],
    })!;
    expect(tracks.map((track) => track.id)).toEqual(["new", "old"]);
    expect(tracks[0]).toMatchObject({
      title: "Chaser",
      artist: "Calibro 35",
      album: "Jazzploitation",
      albumArt: "https://example.com/cover.jpg",
      handle: "listener.test",
      did: "did:plc:listener",
      avatar: "https://example.com/avatar.jpg",
      trackUri: "at://did:plc:artist/app.rocksky.song/song",
      createdAt: "2026-11-23T12:01:00Z",
    });
  });
  test("also accepts flat legacy payloads without losing artwork or listener metadata", () => {
    expect(
      liveScrobbles({
        scrobbles: [
          {
            id: "1",
            title: "Song",
            artist: "Artist",
            cover: "cover",
            user: "alice.test",
            userAvatar: "avatar",
            date: "2026-11-23T12:00:00Z",
          },
        ],
      })?.[0],
    ).toMatchObject({
      albumArt: "cover",
      handle: "alice.test",
      avatar: "avatar",
      createdAt: "2026-11-23T12:00:00Z",
    });
  });
  test("deduplicates records, bounds the shared feed, and preserves separate plays of the same song", () => {
    const rows = Array.from({ length: 20 }, (_, index) =>
      joined(
        String(index),
        `2026-11-23T12:${String(index).padStart(2, "0")}:00Z`,
      ),
    );
    const tracks = liveScrobbles({ scrobbles: [...rows, rows[19]] })!;
    expect(tracks).toHaveLength(12);
    expect(tracks.slice(0, 3).map((track) => track.id)).toEqual([
      "19",
      "18",
      "17",
    ]);
    expect(new Set(tracks.map(scrobbleKey)).size).toBe(12);
  });
  test("ignores malformed messages and supports an authoritative empty snapshot", () => {
    for (const message of [
      null,
      "pong",
      {},
      { scrobbles: "bad" },
      { scrobbles: [null, {}, { title: "no identity" }] },
    ])
      expect(liveScrobbles(message)).toBeNull();
    expect(liveScrobbles({ scrobbles: [] })).toEqual([]);
  });
});

describe("HTTP fallback alongside live pushes", () => {
  test("keeps a freshly pushed feed when an API cache still returns older records", async () => {
    const { reconcileScrobbles } = await import("../src/live-scrobbles");
    const http = [{ id: "old", createdAt: "2026-11-23T12:00:00Z" }];
    const tracks = [{ id: "new", createdAt: "2026-11-23T12:01:00Z" }];
    expect(
      reconcileScrobbles(http, { tracks, receivedAt: 1000 }, 16_000),
    ).toEqual(tracks);
  });
  test("accepts newer HTTP data even when a heartbeat-only socket remains connected", async () => {
    const { reconcileScrobbles } = await import("../src/live-scrobbles");
    const http = [{ id: "new", createdAt: "2026-11-23T12:02:00Z" }];
    const tracks = [{ id: "old", createdAt: "2026-11-23T12:01:00Z" }];
    expect(
      reconcileScrobbles(http, { tracks, receivedAt: 1000 }, 16_000),
    ).toEqual(http);
    expect(reconcileScrobbles(http)).toEqual(http);
  });
  test("expires stale push snapshots so polling can recover changes and deletions", async () => {
    const { reconcileScrobbles } = await import("../src/live-scrobbles");
    const tracks = [{ id: "deleted", createdAt: "2026-11-23T12:01:00Z" }];
    expect(
      reconcileScrobbles([], { tracks, receivedAt: 1000 }, 47_000),
    ).toEqual([]);
    expect(
      reconcileScrobbles(
        [{ id: "cached" }],
        { tracks: [], receivedAt: 1000 },
        16_000,
      ),
    ).toEqual([]);
  });
});
