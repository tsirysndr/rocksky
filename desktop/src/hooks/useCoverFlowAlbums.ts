import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useAtomValue, useSetAtom } from "jotai";
import { useMemo } from "react";
import { artUrl, localLibrary } from "../api/localLibrary";
import {
  coverArtUrlOf,
  fetchNavidromeAlbums,
  searchNavidrome,
} from "../api/navidrome";
import { remoteLibraries } from "../api/remoteLibraries";
import {
  libraryAlbumSelectionAtom,
  librarySourceAtom,
} from "../atoms/librarySource";
import { isTauri } from "../lib/tauri";
import { useNavidromeCredentials } from "./useNavidrome";

export type CoverFlowAlbum = {
  artworkAlbumId?: string;
  id: string;
  name: string;
  artist: string;
  coverArtUrl?: string | null;
};

export function useCoverFlowAlbums(search: string, open: boolean) {
  const source = useAtomValue(librarySourceAtom);
  const setSelection = useSetAtom(libraryAlbumSelectionAtom);
  const navigate = useNavigate();
  const credentials = useNavidromeCredentials();
  const native = isTauri();
  const sources = useQuery({
    queryKey: ["remote-libraries"],
    queryFn: remoteLibraries.list,
    enabled: open && native,
  });
  const remote = sources.data?.sources.find((item) => item.id === source);
  const local = native && source === "local";
  const remoteSelected = native && source !== "local" && source !== "uploaded";
  const uploaded = !local && !remoteSelected;
  const localAlbums = useQuery({
    queryKey: ["local-library", "data", "albums", search, ""],
    queryFn: () => localLibrary.albums(search),
    enabled: open && local,
  });
  const uploadedAlbums = useInfiniteQuery({
    queryKey: ["navidrome", "albums", search || undefined],
    enabled: open && uploaded && !!credentials.data,
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      search
        ? searchNavidrome(credentials.data!, search, {
            albumOffset: pageParam,
            albumCount: 50,
            songCount: 0,
            artistCount: 0,
          }).then((result) => result.albums)
        : fetchNavidromeAlbums(credentials.data!, pageParam, 50),
    getNextPageParam: (page, pages) =>
      page.length < 50 ? undefined : pages.flat().length,
  });
  const albumFolder = useQuery({
    queryKey: ["cover-flow", source, "album-folder"],
    enabled: open && remote?.kind === "upnp",
    queryFn: async () => {
      let offset = 0;
      while (true) {
        const page = await remoteLibraries.browse(source, "", "", offset);
        const folder = page.entries.find(
          (item) =>
            item.kind === "folder" &&
            /^(all )?albums$/i.test(item.title.trim()),
        );
        if (folder) return folder.id;
        if (page.nextOffset === null || page.nextOffset <= offset) break;
        offset = page.nextOffset;
      }
      throw new Error("This server does not expose an Albums folder.");
    },
    retry: false,
  });
  const remoteAlbums = useInfiniteQuery({
    queryKey: ["cover-flow", source, "albums", albumFolder.data, search],
    enabled: open && !!remote && (remote.kind !== "upnp" || !!albumFolder.data),
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      remoteLibraries.browse(
        source,
        remote?.kind === "upnp" ? albumFolder.data! : "albums",
        remote?.kind === "upnp" ? "" : search,
        pageParam,
      ),
    getNextPageParam: (page, _pages, previous) =>
      page.nextOffset !== null && page.nextOffset > previous
        ? page.nextOffset
        : undefined,
    retry: 1,
  });
  const albums = useMemo<CoverFlowAlbum[]>(() => {
    const items = local
      ? (localAlbums.data?.albums ?? []).map((album) => ({
          id: album.id,
          name: album.title,
          artist: album.artist,
          coverArtUrl: artUrl(album.art),
        }))
      : uploaded
        ? (uploadedAlbums.data?.pages.flat() ?? []).map((album) => ({
            ...album,
            coverArtUrl: coverArtUrlOf(album),
            artworkAlbumId: album.id,
          }))
        : (remoteAlbums.data?.pages.flatMap((page) => page.entries) ?? [])
            .filter(
              (album) =>
                (album.kind === "album" ||
                  (remote?.kind === "upnp" && album.kind === "folder")) &&
                (remote?.kind !== "upnp" ||
                  `${album.title} ${album.artist}`
                    .toLowerCase()
                    .includes(search.toLowerCase())),
            )
            .map((album) => ({
              id: album.id,
              name: album.title,
              artist: album.artist,
              coverArtUrl: album.art,
            }));
    return [...new Map(items.map((album) => [album.id, album])).values()];
  }, [
    local,
    uploaded,
    localAlbums.data,
    uploadedAlbums.data,
    remoteAlbums.data,
    remote?.kind,
    search,
  ]);
  const query = local ? localAlbums : uploaded ? uploadedAlbums : remoteAlbums;
  const sourceError =
    remoteSelected && (sources.isError || (sources.isSuccess && !remote));
  const failed =
    query.isError ||
    (uploaded && credentials.isError) ||
    (remote?.kind === "upnp" && albumFolder.isError) ||
    sourceError;
  return {
    albums,
    loading:
      !failed &&
      (query.isLoading ||
        (uploaded && credentials.isLoading) ||
        (remoteSelected && sources.isLoading) ||
        (remote?.kind === "upnp" && albumFolder.isLoading)),
    failed,
    errorMessage: sourceError
      ? "Library unavailable. Choose a library in My Library."
      : albumFolder.error?.message,
    hasMore:
      !local &&
      !!(uploaded ? uploadedAlbums.hasNextPage : remoteAlbums.hasNextPage),
    fetchingMore:
      !local &&
      (uploaded
        ? uploadedAlbums.isFetchingNextPage
        : remoteAlbums.isFetchingNextPage),
    loadMore: () =>
      uploaded ? uploadedAlbums.fetchNextPage() : remoteAlbums.fetchNextPage(),
    retry: () =>
      sourceError
        ? sources.refetch()
        : uploaded && credentials.isError
          ? credentials.refetch()
          : albumFolder.isError
            ? albumFolder.refetch()
            : query.refetch(),
    onSelect: (id: string) => {
      if (uploaded) {
        void navigate({ to: "/library/album/$id", params: { id } });
        return;
      }
      if (local) {
        const album = localAlbums.data?.albums.find((item) => item.id === id);
        if (!album) return;
        setSelection({ source: "local", album });
      } else {
        const album = remoteAlbums.data?.pages
          .flatMap((page) => page.entries)
          .find((item) => item.id === id);
        if (!album) return;
        setSelection({ source: "remote", sourceId: source, album });
      }
      void navigate({ to: "/library", search: { tab: "albums" } });
    },
  };
}
