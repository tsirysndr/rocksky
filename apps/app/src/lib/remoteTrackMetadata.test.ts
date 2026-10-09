import { expect, mock, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";

import type { LibraryEntry } from "../api/remoteLibraries";

const cache = new QueryClient();
let calls = 0;
mock.module("./queryClient", () => ({ queryClient: cache }));
mock.module("../api/remoteLibraries", () => ({
  remoteLibraries: {
    metadata: async () => {
      calls++;
      return {
        title: "Tagged title",
        artist: "Singer",
        album: "Album",
        albumArtist: "Singer",
        durationMs: 1234,
        albumArt: "file:///cover.img",
        artistPicture: "file:///artist.img",
      };
    },
  },
}));
mock.module("../api/search", () => ({ search: async () => ({ hits: [] }) }));
const { enrichRemoteTrack, matchedArtistPicture, matchedAlbumCover } =
  await import("./remoteTrackMetadata");
test("artist lookup requires exact identity and rejects ambiguous pictures", () => {
  const hit = {
    id: "artist",
    uri: "at://did/app.rocksky.artist/a",
    name: "Singer",
    picture: "https://example.test/a.jpg",
  };
  expect(matchedArtistPicture([hit], " singer ")).toBe(hit.picture);
  expect(matchedArtistPicture([hit], "Other singer")).toBe("");
  expect(
    matchedArtistPicture(
      [hit, { ...hit, picture: "https://example.test/b.jpg" }],
      "Singer",
    ),
  ).toBe("");
  expect(
    matchedAlbumCover(
      [
        {
          id: "album",
          artist: "Singer",
          album: "Album",
          albumArt: "https://example.test/cover.jpg",
        },
      ],
      "Other singer",
      "Album",
    ),
  ).toBe("");
});
test("played track enriches cached tracks, albums and artists only in its server", async () => {
  const entries: LibraryEntry[] = [
    {
      id: "song",
      kind: "track",
      title: "filename.mp3",
      artist: "Singer",
      album: "Album",
      durationMs: 0,
      art: null,
    },
    {
      id: "artist",
      kind: "artist",
      title: "Singer",
      artist: "",
      album: "",
      durationMs: 0,
      art: null,
    },
    {
      id: "album",
      kind: "album",
      title: "Album",
      artist: "Singer",
      album: "",
      durationMs: 0,
      art: null,
    },
  ];
  const page = { pages: [{ entries, nextOffset: null }], pageParams: [0] };
  cache.setQueryData(["remote-library", "one", "folder", ""], page);
  cache.setQueryData(["remote-library", "two", "folder", ""], page);
  const track = {
    uploadId: "server:song",
    remoteLibraryId: "one",
    remoteTrackId: "song",
    title: "filename.mp3",
    artist: "Singer",
    album: "Album",
    albumArtist: "Singer",
    durationMs: 0,
    albumArt: null,
    songUri: null,
    albumUri: null,
    artistUri: null,
    sha256: "",
  };
  const [a, b] = await Promise.all([
    enrichRemoteTrack(track),
    enrichRemoteTrack(track),
  ]);
  expect(calls).toBe(1);
  expect(a).toEqual(b);
  const result = cache.getQueryData<typeof page>([
    "remote-library",
    "one",
    "folder",
    "",
  ])!;
  expect(result.pages[0].entries[0].title).toBe("Tagged title");
  expect(result.pages[0].entries[1].art).toBe("file:///artist.img");
  expect(result.pages[0].entries[2].art).toBe("file:///cover.img");
  expect(
    cache.getQueryData<typeof page>(["remote-library", "two", "folder", ""])
      ?.pages[0].entries[0].title,
  ).toBe("filename.mp3");
  expect(
    await enrichRemoteTrack({
      ...track,
      remoteLibraryId: undefined,
      remoteTrackId: undefined,
    }),
  ).toBeNull();
  expect(calls).toBe(1);
  cache.clear();
});
