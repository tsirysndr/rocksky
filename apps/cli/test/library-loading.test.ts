import { afterAll, expect, test } from "bun:test";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { QueryClient, InfiniteQueryObserver } from "@tanstack/react-query";
const home = fs.mkdtempSync(path.join(os.tmpdir(), "rocksky-library-"));
const homedir = os.homedir,
  fetcher = globalThis.fetch;
os.homedir = () => home;
const token = "offline-library-test";
fs.mkdirSync(path.join(home, ".rocksky"));
fs.writeFileSync(
  path.join(home, ".rocksky/navidrome.json"),
  JSON.stringify({
    handle: "listener.test",
    apiKey: "secret-test",
    account: createHash("sha256").update(token).digest("hex"),
  }),
);
const pure = process.env.ROCKSKY_TEST_VARIANT === "purescript";
const directory = path.resolve(
  import.meta.dir,
  pure ? "../../../purescript/cli/runtime/tui" : "../src/tui",
);
const load = (name: string) =>
  import(
    pathToFileURL(path.join(directory, name + (pure ? ".js" : ".ts"))).href
  );
const library = await load("library");
const { queryClient } = await load("queryClient");
const pending: any[] = [];
globalThis.fetch = ((url: any) =>
  new Promise<Response>((resolve) =>
    pending.push({ url: new URL(String(url)), resolve }),
  )) as typeof fetch;
const tick = () => new Promise((r) => setTimeout(r, 0));
function respond(request: any) {
  const method = request.url.pathname.split("/").pop();
  const bodies: any = {
    search3: {
      searchResult3: {
        song: [{ id: "track1", title: "Song", artist: "Artist", duration: 42 }],
      },
    },
    getAlbumList2: {
      albumList2: {
        album: Array.from({ length: 50 }, (_, i) => ({
          id: "album" + i,
          name: "Album " + i,
          artist: "Artist",
          songCount: 1,
        })),
      },
    },
    getArtists: {
      artists: {
        index: [{ artist: [{ id: "artist1", name: "Artist", albumCount: 1 }] }],
      },
    },
    getStarred2: {
      starred2: { song: [{ id: "favorite1", title: "Favorite" }] },
    },
    getPlaylists: {
      playlists: { playlist: [{ id: "playlist1", name: "Playlist" }] },
    },
    getAlbum: {
      album: {
        song: [{ id: "track1", title: "Song", track: 2, discNumber: 1 }],
      },
    },
    getArtist: {
      artist: { album: [{ id: "album0", name: "Album 0", artist: "Artist" }] },
    },
  };
  request.resolve(
    Response.json({ "subsonic-response": { status: "ok", ...bodies[method] } }),
  );
}
test("preloads every tab using web endpoints; switching shares requests and cached rows stay visible during a slow refresh", async () => {
  const warming = library.warmLibrary(token);
  await tick();
  expect(pending.map((r) => r.url.pathname.split("/").pop()).sort()).toEqual([
    "getAlbumList2",
    "getArtists",
    "getPlaylists",
    "getStarred2",
    "search3",
  ]);
  const entering = queryClient.fetchInfiniteQuery(
    library.libraryQuery(token, "albums"),
  );
  await tick();
  expect(pending.length).toBe(5);
  expect(pending.some((r) => r.url.pathname.includes("/uploads"))).toBe(false);
  pending.forEach(respond);
  await warming;
  expect((await entering).pages[0][0]).toMatchObject({
    navidromeId: "album0",
    album: "Album 0",
  });
  expect(
    queryClient.getQueryData(["library", token, "artists", ""]).pages[0][0]
      .name,
  ).toBe("Artist");
  expect(
    queryClient.getQueryData(["library", token, "favorites", ""]).pages[0][0]
      .trackId,
  ).toBe("favorite1");
  expect(queryClient.getQueryData(["playlists", token])[0].name).toBe(
    "Playlist",
  );
  const fresh = new QueryClient();
  const observer = new InfiniteQueryObserver(fresh, {
    ...library.libraryQuery(token, "albums"),
    staleTime: 0,
  });
  const stop = observer.subscribe(() => {});
  await tick();
  expect(observer.getCurrentResult().isFetching).toBe(true);
  expect(observer.getCurrentResult().data.pages[0].length).toBe(50);
  expect(
    library.libraryQuery("another-account", "albums").initialData,
  ).toBeUndefined();
  expect(
    library
      .libraryQuery(token, "artists")
      .getNextPageParam(Array(50), [Array(50)]),
  ).toBeUndefined();
  expect(
    library
      .libraryQuery(token, "albums")
      .getNextPageParam(Array(50), [Array(50)]),
  ).toBe(50);
  respond(pending.at(-1));
  await tick();
  stop();
  fresh.clear();
  const directory = path.join(home, ".rocksky/library-cache");
  const files = fs
    .readdirSync(directory, { recursive: true })
    .filter((f) => String(f).endsWith(".json"));
  expect(files.length).toBe(5);
  for (const file of files) {
    const body = fs.readFileSync(path.join(directory, String(file)), "utf8");
    expect(body.includes(token)).toBe(false);
    expect(body.includes("secret-test")).toBe(false);
  }
});
test("album and artist drill-downs use indexed IDs and preserve playback metadata", async () => {
  for (const type of ["album", "artist"]) {
    const work = library
      .libraryQuery(token, "albums", [
        { type, label: "Example", name: "Artist", navidromeId: type + "0" },
      ])
      .queryFn({ pageParam: 0 });
    await tick();
    expect(pending.at(-1).url.pathname).toBe(
      type === "album" ? "/rest/getAlbum" : "/rest/getArtist",
    );
    expect(pending.at(-1).url.searchParams.get("id")).toBe(type + "0");
    respond(pending.at(-1));
    const rows = await work;
    if (type === "album")
      expect(rows[0]).toMatchObject({
        trackId: "track1",
        uploadId: "",
        trackNumber: 2,
        discNumber: 1,
      });
    else expect(rows[0].navidromeId).toBe("album0");
  }
});
afterAll(() => {
  queryClient.clear();
  globalThis.fetch = fetcher;
  os.homedir = homedir;
  fs.rmSync(home, { recursive: true, force: true });
});
