import { describe, expect, test } from "bun:test";
import { normalizeSearch } from "../src/search";

const base = "https://rocksky.app";
const hit = (kind: string, fields: Record<string, unknown>) => ({
  _federation: { indexUid: kind },
  ...fields,
});

describe("public search response normalization", () => {
  test("maps all music categories and people to web app routes", () => {
    const hits = [
      hit("tracks", {
        title: "Song",
        artist: "Artist",
        uri: "at://did:plc:test/app.rocksky.song/123",
      }),
      hit("artists", {
        name: "Artist",
        uri: "at://did:plc:test/app.rocksky.artist/123",
      }),
      hit("albums", {
        title: "Album",
        uri: "at://did:plc:test/app.rocksky.album/123",
      }),
      hit("playlists", {
        name: "Playlist",
        uri: "at://did:plc:test/app.rocksky.playlist/123",
      }),
      hit("users", { handle: "listener.test", displayName: "Listener" }),
    ];
    const results = normalizeSearch({ hits }, base);
    expect(results.map((item) => item.href)).toEqual([
      `${base}/did%3Aplc%3Atest/song/123`,
      `${base}/did%3Aplc%3Atest/artist/123`,
      `${base}/did%3Aplc%3Atest/album/123`,
      `${base}/did%3Aplc%3Atest/playlist/123`,
      `${base}/profile/listener.test`,
    ]);
    expect(results[4].subtitle).toBe("@listener.test");
  });

  test("ignores missing destinations, unknown categories, and mismatched records", () => {
    expect(
      normalizeSearch(
        {
          hits: [
            null,
            {},
            hit("users", {}),
            hit("tracks", { title: "Missing URI" }),
            hit("tracks", {
              title: "Wrong record",
              uri: "at://did:plc:test/app.rocksky.album/123",
            }),
            hit("unknown", { name: "Unknown" }),
          ],
        },
        base,
      ),
    ).toEqual([]);
    expect(normalizeSearch(null, base)).toEqual([]);
    expect(normalizeSearch({ hits: {} }, base)).toEqual([]);
  });

  test("deduplicates destinations and safely handles artwork fallbacks", () => {
    const user = hit("users", {
      handle: "listener.test",
      avatar: "https://cdn.example/@jpeg",
    });
    const results = normalizeSearch(
      {
        hits: [
          user,
          user,
          hit("users", { handle: "other.test", avatar: "javascript:alert(1)" }),
          hit("tracks", {
            title: "Song",
            uri: "at://did:plc:test/app.rocksky.song/123",
            cover: "https://example.org/cover.jpg",
          }),
        ],
      },
      base,
    );
    expect(results).toHaveLength(3);
    expect(results[0].image).toBeUndefined();
    expect(results[1].image).toBeUndefined();
    expect(results[2].image).toBe("https://example.org/cover.jpg");
  });
});
