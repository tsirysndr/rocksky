import type { QueueItem } from "./player";
import {
  getCreds,
  getStarred,
  getPlaylists,
  getPlaylist,
  getAlbums,
  getArtists,
  getArtist,
  getTracks,
  getAlbum,
} from "./navidrome";
import { queryClient } from "./queryClient";
import { readMetadata, saveMetadata, metadataQuery } from "./libraryCache";

export const PAGE_SIZE = 50;
export type Mode = "tracks" | "albums" | "artists" | "favorites" | "playlists";
export interface TrackItem extends QueueItem {
  kind: "track";
  trackNumber?: number;
  discNumber?: number;
}
export interface AlbumItem {
  navidromeId?: string;
  kind: "album";
  album: string;
  albumArtist: string;
  albumUri?: string;
  trackCount: number;
}
export interface ArtistItem {
  navidromeId?: string;
  kind: "artist";
  name: string;
  albumCount: number;
  trackCount: number;
}
export type Row = TrackItem | AlbumItem | ArtistItem;

export type Drill =
  | {
      type: "album";
      navidromeId?: string;
      label: string;
      albumArtist?: string;
      albumName?: string;
      albumUri?: string;
    }
  | { type: "artist"; label: string; name: string; navidromeId?: string };

async function loadPage(
  token: string,
  mode: Mode,
  drill: Drill[],
  skip: number,
): Promise<Row[]> {
  const top = drill[drill.length - 1];
  if (mode === "playlists") return [];
  const creds = await getCreds(token);
  if (!creds) throw new Error("Sign in to load your library.");
  if (top?.type === "album") {
    if (!top.navidromeId)
      throw new Error("Reopen the album from the Albums tab.");
    return (await getAlbum(creds, top.navidromeId)).entries
      .map(toFavTrack)
      .sort(
        (a, b) =>
          (a.discNumber ?? 1) - (b.discNumber ?? 1) ||
          (a.trackNumber ?? 0) - (b.trackNumber ?? 0),
      );
  }
  if (top?.type === "artist") {
    if (!top.navidromeId)
      throw new Error("Reopen the artist from the Artists tab.");
    return (await getArtist(creds, top.navidromeId)).map(toNavAlbum);
  }
  if (mode === "favorites") return (await getStarred(creds)).map(toFavTrack);
  if (mode === "albums")
    return (await getAlbums(creds, skip, PAGE_SIZE)).map(toNavAlbum);
  if (mode === "artists")
    return (await getArtists(creds)).map((artist: any): ArtistItem => ({
      kind: "artist",
      navidromeId: artist.id,
      name: artist.name,
      albumCount: artist.albumCount ?? 0,
      trackCount: artist.songCount ?? 0,
    }));
  return (await getTracks(creds, skip, PAGE_SIZE)).map(toFavTrack);
}

const toNavAlbum = (album: any): AlbumItem => ({
  kind: "album",
  navidromeId: album.id,
  album: album.name,
  albumArtist: album.artist,
  albumUri: album.uri,
  trackCount: album.songCount ?? 0,
});
export async function resolveLibraryTracks(
  token: string,
  row: Row,
): Promise<QueueItem[]> {
  if (row.kind === "track") return [row];
  const creds = await getCreds(token);
  if (!creds || !row.navidromeId)
    throw new Error("Reopen the library to refresh this item.");
  if (row.kind === "album")
    return (await getAlbum(creds, row.navidromeId)).entries.map(toFavTrack);
  const albums = await getArtist(creds, row.navidromeId);
  const tracks: QueueItem[] = [];
  // Avoid flooding the server when queuing an artist's entire discography.
  for (const album of albums)
    tracks.push(...(await getAlbum(creds, album.id)).entries.map(toFavTrack));
  return tracks;
}

export function libraryQuery(token: string, mode: Mode, drill: Drill[] = []) {
  const drillKey = drill
    .map((d) => `${d.type}:${d.navidromeId ?? d.label}`)
    .join(">");
  const cacheKey = JSON.stringify(["library-v2", mode, drillKey]);
  const saved = readMetadata<Row[]>(token, cacheKey);
  return {
    queryKey: ["library", token, mode, drillKey],
    enabled: !!token && mode !== "playlists",
    initialPageParam: 0,
    staleTime: 60_000,
    gcTime: 30 * 60_000,
    retry: false as const,
    initialData:
      saved && Array.isArray(saved.data)
        ? { pages: [saved.data], pageParams: [0] }
        : undefined,
    initialDataUpdatedAt: saved?.updatedAt,
    queryFn: async ({ pageParam }: { pageParam: number }) => {
      const rows = await loadPage(token, mode, drill, pageParam);
      if (pageParam === 0) saveMetadata(token, cacheKey, rows);
      return rows;
    },
    getNextPageParam: (last: Row[], pages: Row[][]) =>
      drill.length ||
      mode === "favorites" ||
      mode === "artists" ||
      last.length < PAGE_SIZE
        ? undefined
        : pages.reduce((n, page) => n + page.length, 0),
  };
}
export const playlistsQuery = (token: string) =>
  metadataQuery(token, ["playlists", token], async () => {
    const creds = await getCreds(token);
    if (!creds) throw new Error("Sign in to load playlists.");
    return getPlaylists(creds);
  });
export const playlistQuery = (token: string, id: string) => ({
  ...metadataQuery(token, ["playlist", token, id], async () => {
    const creds = await getCreds(token);
    if (!creds) throw new Error("Sign in to load this playlist.");
    return getPlaylist(creds, id);
  }),
  enabled: !!token && !!id,
});
// Prime only first pages. TanStack shares in-flight requests with the active
// tab, so switching tabs never starts a second copy of a pending preload.
export function warmLibrary(token: string) {
  return Promise.allSettled([
    ...(["tracks", "albums", "artists", "favorites"] as const).map((mode) =>
      queryClient.prefetchInfiniteQuery(libraryQuery(token, mode)),
    ),
    queryClient.prefetchQuery(playlistsQuery(token)),
  ]);
}

export const toTrack = (r: any): TrackItem => ({
  kind: "track",
  uploadId: r.upload.id,
  title: r.track.title,
  artist: r.track.artist,
  album: r.track.album,
  albumArtist: r.track.albumArtist,
  albumArt: r.track.albumArt,
  duration: r.track.duration,
  mimeType: r.upload.mimeType,
  uri: r.track.uri,
  trackId: r.track.id,
  trackNumber: r.track.trackNumber ?? undefined,
  discNumber: r.track.discNumber ?? undefined,
});

// A Navidrome starred song → a track row (streamed via Navidrome, no uploadId).
const toFavTrack = (s: any): TrackItem => ({
  kind: "track",
  uploadId: "",
  trackId: s.id,
  title: s.title,
  artist: s.artist,
  album: s.album,
  duration: s.duration ? s.duration * 1000 : undefined,
  albumArtist: s.albumArtist ?? s.artist,
  albumArt: s.coverArtUrl ?? undefined,
  mimeType: s.contentType,
  trackNumber: s.track,
  discNumber: s.discNumber,
});

export const toAlbum = (r: any): AlbumItem => ({
  kind: "album",
  album: r.album,
  albumArtist: r.albumArtist,
  albumUri: r.albumUri || undefined,
  trackCount: r.trackCount ?? 0,
});

const toArtist = (r: any): ArtistItem => ({
  kind: "artist",
  name: r.name,
  albumCount: r.albumCount ?? 0,
  trackCount: r.trackCount ?? 0,
});
