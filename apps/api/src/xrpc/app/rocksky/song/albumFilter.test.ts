import { describe, expect, it } from "bun:test";
import {
  canonicalScore,
  getCacheKey,
  pickByAlbum,
  pickRowByAlbum,
  preferCanonical,
} from "./albumFilter";

describe("pickByAlbum (provider search results)", () => {
  const items = [
    { id: "remaster", album: { name: "Thriller (2003 Remaster)", album_type: "album" } },
    { id: "live", album: { name: "Live in Bucharest", album_type: "album" } },
    { id: "official", album: { name: "Thriller", album_type: "album" } },
    { id: "single", album: { name: "Thriller - Single", album_type: "single" } },
  ];

  it("prefers the hit from the requested album over the first-ranked one", () => {
    expect(pickByAlbum(items, "Thriller")?.id).toBe("official");
  });

  it("matches the album case-insensitively", () => {
    expect(pickByAlbum(items, "tHRiLLeR")?.id).toBe("official");
    expect(pickByAlbum(items, "live in bucharest")?.id).toBe("live");
  });

  it("keeps the first of several hits from the requested album", () => {
    const dupes = [
      { id: "a", album: { name: "Thriller" } },
      { id: "b", album: { name: "thriller" } },
    ];
    expect(pickByAlbum(dupes, "Thriller")?.id).toBe("a");
  });

  it("falls back to the most canonical hit when no result is from that album", () => {
    expect(pickByAlbum(items, "Bad")?.id).toBe("official");
  });

  it("prefers the plain studio album when no album is requested", () => {
    expect(pickByAlbum(items)?.id).toBe("official");
    expect(pickByAlbum(items, "")?.id).toBe("official");
  });

  it("tolerates hits without album metadata", () => {
    const sparse = [{ id: "bare" }, { id: "full", album: { name: "Thriller" } }];
    expect(pickByAlbum(sparse, "Thriller")?.id).toBe("full");
  });

  it("returns undefined on an empty result list", () => {
    expect(pickByAlbum([], "Thriller")).toBe(undefined);
    expect(pickByAlbum([])).toBe(undefined);
  });
});

describe("canonical-edition ranking", () => {
  it("scores a plain studio album above remaster/live/single/deluxe editions", () => {
    const studio = canonicalScore("Thriller", "album");
    expect(studio > canonicalScore("Thriller (2003 Remaster)", "album")).toBe(true);
    expect(studio > canonicalScore("Live in Bucharest", "album")).toBe(true);
    expect(studio > canonicalScore("Thriller - Single", "single")).toBe(true);
    expect(studio > canonicalScore("Thriller (Deluxe Edition)", "album")).toBe(true);
  });

  it("uses Spotify's album_type when the names alone can't tell", () => {
    expect(
      canonicalScore("Beat It", "album") > canonicalScore("Beat It", "compilation"),
    ).toBe(true);
  });

  it("prefers album_type=album over a single even without name markers", () => {
    const hits = [
      { id: "single", album: { name: "Beat It", album_type: "single" } },
      { id: "album", album: { name: "Thriller", album_type: "album" } },
    ];
    expect(pickByAlbum(hits)?.id).toBe("album");
  });

  it("keeps the provider's own order on ties", () => {
    const hits = [
      { id: "first", album: { name: "Thriller", album_type: "album" } },
      { id: "second", album: { name: "Bad", album_type: "album" } },
    ];
    expect(pickByAlbum(hits)?.id).toBe("first");
  });

  it("still picks an album whose real title contains a marker when it's the only candidate", () => {
    const only = [{ id: "hole", album: { name: "Live Through This", album_type: "album" } }];
    expect(pickByAlbum(only)?.id).toBe("hole");
  });

  it("preferCanonical returns undefined only for an empty list", () => {
    expect(preferCanonical([], () => ({}))).toBe(undefined);
  });
});

describe("pickRowByAlbum (database rows)", () => {
  const row = (id: string, trackAlbum: string | null, albumTitle: string | null) => ({
    id,
    tracks: { album: trackAlbum },
    albums: albumTitle === null ? null : { title: albumTitle },
  });

  const rows = [
    row("remaster", "Thriller (2003 Remaster)", "Thriller (2003 Remaster)"),
    row("official", "Thriller", "Thriller"),
  ];

  it("matches on the track's own album field, case-insensitively", () => {
    expect(pickRowByAlbum(rows, "thriller").match?.id).toBe("official");
  });

  it("matches on the joined albums row when the track album differs", () => {
    const joined = [row("a", "Something Else", "Thriller")];
    expect(pickRowByAlbum(joined, "Thriller").match?.id).toBe("a");
  });

  it("rejects (but surfaces the most canonical row) when no row is from that album", () => {
    const { match, rejected } = pickRowByAlbum(rows, "Bad");
    expect(match).toBe(undefined);
    expect(rejected?.id).toBe("official");
  });

  it("prefers the plain studio album row when no album is requested", () => {
    const { match, rejected } = pickRowByAlbum(rows);
    expect(match?.id).toBe("official");
    expect(rejected).toBe(undefined);
  });

  it("tolerates rows with no album info at all", () => {
    const bare = [row("bare", null, null)];
    expect(pickRowByAlbum(bare, "Thriller").match).toBe(undefined);
    expect(pickRowByAlbum(bare, "Thriller").rejected?.id).toBe("bare");
  });

  it("handles an empty row set", () => {
    expect(pickRowByAlbum([], "Thriller").match).toBe(undefined);
    expect(pickRowByAlbum([], "Thriller").rejected).toBe(undefined);
    expect(pickRowByAlbum([]).match).toBe(undefined);
  });
});

describe("getCacheKey", () => {
  it("keys title/artist matches on the album so editions don't collide", () => {
    const base = { title: "Thriller", artist: "Michael Jackson" };
    expect(getCacheKey(base)).toBe("matchSong:thriller:michael jackson");
    expect(getCacheKey({ ...base, album: "Thriller" })).toBe(
      "matchSong:thriller:michael jackson:album:thriller",
    );
    // Case-insensitive: same album spelled differently hits the same entry.
    expect(getCacheKey({ ...base, album: "THRILLER" })).toBe(
      getCacheKey({ ...base, album: "thriller" }),
    );
  });

  it("keys mbId/isrc matches on the album too (same id, several editions)", () => {
    const base = { title: "Thriller", artist: "Michael Jackson" };
    expect(getCacheKey({ ...base, mbId: "mb-1" })).toBe("matchSong:mbId:mb-1");
    expect(getCacheKey({ ...base, mbId: "mb-1", album: "Thriller" })).toBe(
      "matchSong:mbId:mb-1:album:thriller",
    );
    expect(getCacheKey({ ...base, isrc: "USSM19902991", album: "Thriller" })).toBe(
      "matchSong:isrc:USSM19902991:album:thriller",
    );
  });
});
