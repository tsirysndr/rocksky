import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCoverFlowAlbums } from "./useCoverFlowAlbums";

const mocks = vi.hoisted(() => ({
  source: "uploaded",
  kind: "navidrome",
  navigate: vi.fn(),
  select: vi.fn(),
  nextPage: vi.fn(),
  local: [] as object[],
  uploaded: [] as object[],
  remote: [] as object[],
  queries: [] as { queryKey: unknown[]; enabled: boolean }[],
}));
vi.mock("react", () => ({ useMemo: (fn: () => unknown) => fn() }));
vi.mock("jotai", () => ({
  atom: vi.fn(),
  useAtomValue: () => mocks.source,
  useSetAtom: () => mocks.select,
}));
vi.mock("../atoms/librarySource", () => ({
  librarySourceAtom: {},
  libraryAlbumSelectionAtom: {},
}));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
}));
vi.mock("../lib/tauri", () => ({ isTauri: () => true }));
vi.mock("../api/localLibrary", () => ({
  artUrl: (path: string) => (path ? `asset://${path}` : null),
  localLibrary: {},
}));
vi.mock("../api/remoteLibraries", () => ({ remoteLibraries: {} }));
vi.mock("../api/navidrome", () => ({
  coverArtUrlOf: (album: { coverArtUrl: string }) => album.coverArtUrl,
}));
vi.mock("./useNavidrome", () => ({
  useNavidromeCredentials: () => ({
    data: {},
    isLoading: false,
    isError: false,
  }),
}));
vi.mock("@tanstack/react-query", () => {
  const state = (data: unknown) => ({
    data,
    isLoading: false,
    isSuccess: true,
    isError: false,
    refetch: vi.fn(),
    hasNextPage: true,
    isFetchingNextPage: false,
    fetchNextPage: mocks.nextPage,
  });
  return {
    useQuery: (options: { queryKey: unknown[]; enabled: boolean }) => {
      mocks.queries.push(options);
      if (options.queryKey[0] === "remote-libraries")
        return state({ sources: [{ id: "server", kind: mocks.kind }] });
      if (options.queryKey[0] === "local-library")
        return state({ albums: mocks.local });
      return state("album-folder");
    },
    useInfiniteQuery: (options: { queryKey: unknown[]; enabled: boolean }) => {
      mocks.queries.push(options);
      return state(
        options.queryKey[0] === "navidrome"
          ? { pages: [mocks.uploaded] }
          : { pages: [{ entries: mocks.remote }] },
      );
    },
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.source = "uploaded";
  mocks.kind = "navidrome";
  mocks.local = [];
  mocks.uploaded = [];
  mocks.remote = [];
  mocks.queries = [];
});

describe("desktop Cover Flow libraries", () => {
  it("opens uploaded album details and deduplicates paginated albums", () => {
    const album = {
      id: "a",
      name: "Album",
      artist: "Artist",
      coverArtUrl: "https://art/a",
    };
    mocks.uploaded = [album, album];
    const result = useCoverFlowAlbums("", true);
    expect(result.albums).toHaveLength(1);
    expect(result.albums[0].artworkAlbumId).toBe("a");
    result.onSelect("a");
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/library/album/$id",
      params: { id: "a" },
    });
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("uses local artwork and hands the selected album to local details", () => {
    mocks.source = "local";
    const album = {
      id: "local-a",
      title: "Local album",
      artist: "Artist",
      art: "/covers/a.jpg",
    };
    mocks.local = [album];
    const result = useCoverFlowAlbums("Local", true);
    expect(result.albums[0].coverArtUrl).toBe("asset:///covers/a.jpg");
    expect(result.hasMore).toBe(false);
    expect(result.albums[0].artworkAlbumId).toBeUndefined();
    result.onSelect("local-a");
    expect(mocks.select).toHaveBeenCalledWith({ source: "local", album });
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/library",
      search: { tab: "albums" },
    });
    expect(
      mocks.queries.find((q) => q.queryKey[0] === "navidrome")?.enabled,
    ).toBe(false);
  });

  it("keeps server album IDs and source together when opening details", () => {
    mocks.source = "server";
    const album = {
      id: "remote-a",
      kind: "album",
      title: "Server album",
      artist: "Artist",
      art: null,
    };
    mocks.remote = [album, { id: "song", kind: "track" }];
    const result = useCoverFlowAlbums("Server", true);
    expect(result.albums.map((a) => a.id)).toEqual(["remote-a"]);
    result.onSelect("remote-a");
    expect(mocks.select).toHaveBeenCalledWith({
      source: "remote",
      sourceId: "server",
      album,
    });
    result.loadMore();
    expect(mocks.nextPage).toHaveBeenCalledOnce();
  });

  it("filters UPnP album folders locally while allowing further pages", () => {
    mocks.source = "server";
    mocks.kind = "upnp";
    mocks.remote = [
      { id: "a", kind: "folder", title: "Blue", artist: "Artist" },
      { id: "b", kind: "folder", title: "Red", artist: "Other" },
    ];
    const result = useCoverFlowAlbums("blue", true);
    expect(result.albums.map((a) => a.id)).toEqual(["a"]);
    expect(result.hasMore).toBe(true);
  });

  it("does not fetch album pages while Cover Flow is closed", () => {
    useCoverFlowAlbums("", false);
    expect(mocks.queries.every((q) => !q.enabled)).toBe(true);
  });
});
