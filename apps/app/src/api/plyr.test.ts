import { expect, spyOn, test } from "bun:test";
import {
  createPlyrBrowser,
  plyrEntry,
  plyrTrack,
  plyrDisplayLabel,
} from "./plyr";

test("track artwork falls back to album artwork and seconds become milliseconds", () => {
  expect(
    plyrEntry({
      id: 1,
      title: "Song",
      artist: "Artist",
      duration: 12,
      album: { title: "Album", image_url: "https://images.plyr.fm/cover.png" },
    }),
  ).toMatchObject({
    id: "1",
    durationMs: 12000,
    album: "Album",
    art: "https://images.plyr.fm/cover.png",
  });
});

test("opaque cursors remain scoped to each browsing path through refreshes", async () => {
  const requests: string[] = [];
  const browse = createPlyrBrowser(async (path) => {
    requests.push(path);
    return {
      tracks: [{ id: 1, title: "Song" }],
      has_more: !path.includes("cursor="),
      next_cursor: "opaque+/=",
    };
  });
  const first = await browse("tracks", "", 0);
  await browse("artist:did:plc:abc", "", 0);
  await browse("tracks", "", 0);
  const last = await browse("tracks", "", first.nextOffset!);
  expect(last.nextOffset).toBeNull();
  expect(
    new URL(`https://api.plyr.fm${requests.at(-1)}`).searchParams.get("cursor"),
  ).toBe("opaque+/=");
  await expect(browse("artists", "", first.nextOffset!)).rejects.toThrow(
    "expired",
  );
});

test("a repeated upstream cursor terminates pagination", async () => {
  const browse = createPlyrBrowser(async () => ({
    tracks: [],
    has_more: true,
    next_cursor: "same",
  }));
  const first = await browse("tracks", "", 0);
  expect((await browse("tracks", "", first.nextOffset!)).nextOffset).toBeNull();
});

test("artist search uses the public search API and returns navigable artist IDs", async () => {
  const browse = createPlyrBrowser(async (path) => {
    expect(path).toBe("/search/?q=Artist&type=artists&limit=50");
    return {
      results: [
        { did: "did:plc:abc", display_name: "Artist", handle: "artist.test" },
      ],
    };
  });
  expect((await browse("artists", "Artist", 0)).entries[0]).toMatchObject({
    id: "artist:did:plc:abc",
    kind: "artist",
  });
});

test("radio lineup comes from the API and station rotation starts at the current track", async () => {
  const browse = createPlyrBrowser(async (path) => {
    if (path === "/radio/stations")
      return {
        stations: [
          { slug: "fresh", name: "fresh", description: "Newest uploads" },
        ],
      };
    expect(path).toContain("station=fresh&catalog_only=true");
    return {
      current: { id: 2 },
      rotation: [
        { id: 1, title: "First" },
        { id: 2, title: "Current" },
      ],
    };
  });
  expect((await browse("radio", "", 0)).entries[0].id).toBe("station:fresh");
  expect(
    (await browse("station:fresh", "", 0)).entries.map((t) => t.id),
  ).toEqual(["2", "1"]);
});

test("album browsing uses handle and slug with safe URL encoding", async () => {
  const browse = createPlyrBrowser(async (path) => {
    if (path === "/albums/")
      return {
        albums: [{ title: "Album", artist_handle: "artist.test", slug: "a/b" }],
      };
    expect(path).toBe("/albums/artist.test/a%2Fb");
    return { tracks: [{ id: 1, title: "Song" }] };
  });
  const album = (await browse("albums", "", 0)).entries[0];
  expect((await browse(album.id, "", 0)).entries[0].title).toBe("Song");
});

test("supporter-gated tracks never resolve to a public audio URL", async () => {
  const request = spyOn(globalThis, "fetch").mockResolvedValue(
    Response.json({ id: 1, file_id: "private", gated: true }),
  );
  try {
    await expect(plyrTrack("1")).rejects.toThrow("supporter access");
  } finally {
    request.mockRestore();
  }
});

test("handles get one @ while display names and playback metadata stay unchanged", () => {
  expect(plyrDisplayLabel("piss.beauty", "piss.beauty")).toBe("@piss.beauty");
  expect(plyrDisplayLabel("@piss.beauty", "piss.beauty")).toBe("@piss.beauty");
  expect(plyrDisplayLabel("stellz", "piss.beauty")).toBe("stellz");
  const entry = plyrEntry({
    id: 56,
    title: "banana mix",
    artist: "piss.beauty",
    artist_handle: "piss.beauty",
  });
  expect(entry.artist).toBe("piss.beauty");
  expect(plyrDisplayLabel(entry.artist, entry.artistHandle)).toBe(
    "@piss.beauty",
  );
});
