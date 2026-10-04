import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
} from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import {
  coverArtUrlOf,
  dedupeById,
  fetchNavidromeAlbum,
  fetchNavidromeAlbums,
  fetchNavidromeArtist,
  fetchNavidromeArtists,
  type NavidromeAlbum,
  type NavidromeArtist,
  type NavidromeCredentials,
  type NavidromeSong,
  navidromeStreamUrl,
  resolveNavidromeApiKey,
  searchNavidrome,
} from "../api/navidrome";
import { profileAtom } from "../atoms/profile";
import type { UploadQueueTrack } from "../lib/uploadEngine";

const ALBUMS_PAGE = 50;

// The library barely moves between visits, so tab switches and remounts render
// from cache instead of waiting on the network.
const STALE_TIME = 5 * 60 * 1000;
const GC_TIME = 30 * 60 * 1000;

export const useNavidromeCredentials = () => {
  const profile = useAtomValue(profileAtom);
  const handle = profile?.handle;
  return useQuery<NavidromeCredentials>({
    queryKey: ["navidrome", "credentials", handle],
    enabled: !!handle,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    queryFn: async () => ({
      handle: handle as string,
      apiKey: await resolveNavidromeApiKey(),
    }),
  });
};

/** A navidrome song as the local playback engine wants it. */
export const songToQueueTrack = (
  song: NavidromeSong,
  creds: NavidromeCredentials,
  albumArtOverride?: string | null,
): UploadQueueTrack => ({
  uploadId: song.id,
  title: song.title,
  artist: song.artist,
  albumArtist: song.albumArtist ?? song.artist,
  album: song.album,
  albumArt:
    albumArtOverride !== undefined ? albumArtOverride : coverArtUrlOf(song),
  durationMs: song.duration * 1000,
  songUri: null,
  albumUri: null,
  artistUri: null,
  sha256: "",
  streamUrl: navidromeStreamUrl(song.id, creds),
});

export const useNavidromeAlbumsInfiniteQuery = (q: string, enabled = true) => {
  const { data: creds } = useNavidromeCredentials();
  return useInfiniteQuery({
    queryKey: ["navidrome", "albums", q],
    enabled: enabled && !!creds,
    initialPageParam: 0,
    queryFn: ({ pageParam }): Promise<NavidromeAlbum[]> => {
      const credentials = creds as NavidromeCredentials;
      if (q) {
        return searchNavidrome(credentials, q, {
          albumOffset: pageParam,
          albumCount: ALBUMS_PAGE,
          songCount: 0,
          artistCount: 0,
        }).then((result) => result.albums);
      }
      return fetchNavidromeAlbums(credentials, pageParam, ALBUMS_PAGE);
    },
    getNextPageParam: (lastPage, pages) =>
      lastPage.length < ALBUMS_PAGE ? undefined : pages.length * ALBUMS_PAGE,
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
    refetchOnMount: false,
    placeholderData: keepPreviousData,
  });
};

/** Unpaged, like the web clients: getArtists returns the whole index. */
export const useNavidromeArtistsQuery = (q: string, enabled = true) => {
  const { data: creds } = useNavidromeCredentials();
  return useQuery({
    queryKey: ["navidrome", "artists", q],
    enabled: enabled && !!creds,
    queryFn: async (): Promise<NavidromeArtist[]> => {
      const credentials = creds as NavidromeCredentials;
      if (q) {
        const result = await searchNavidrome(credentials, q, {
          artistCount: 200,
          songCount: 0,
          albumCount: 0,
        });
        return dedupeById(result.artists);
      }
      // getArtists buckets by initial, and an artist can appear under more than
      // one bucket, so flattening the index can repeat ids.
      return dedupeById(await fetchNavidromeArtists(credentials));
    },
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
    refetchOnMount: false,
    placeholderData: keepPreviousData,
  });
};

export const useNavidromeAlbumQuery = (albumId: string | null) => {
  const { data: creds } = useNavidromeCredentials();
  return useQuery({
    queryKey: ["navidrome", "album", albumId],
    enabled: !!creds && !!albumId,
    queryFn: () =>
      fetchNavidromeAlbum(creds as NavidromeCredentials, albumId as string),
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
    refetchOnMount: false,
  });
};

export const useNavidromeArtistQuery = (artistId: string | null) => {
  const { data: creds } = useNavidromeCredentials();
  return useQuery({
    queryKey: ["navidrome", "artist", artistId],
    enabled: !!creds && !!artistId,
    queryFn: () =>
      fetchNavidromeArtist(creds as NavidromeCredentials, artistId as string),
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
    refetchOnMount: false,
  });
};

/**
 * Every track of every album an artist is credited on.
 *
 * getArtist only lists the albums, so the queue for "play this artist" is one
 * getAlbum per album; they go out together since the engine needs the lot
 * before it can open the queue.
 */
export const fetchArtistQueue = async (
  albums: NavidromeAlbum[],
  creds: NavidromeCredentials,
): Promise<UploadQueueTrack[]> => {
  const perAlbum = await Promise.all(
    albums.map(async (album) => {
      const full = await fetchNavidromeAlbum(creds, album.id);
      const art = coverArtUrlOf(full ?? album);
      return (full?.song ?? []).map((song) =>
        songToQueueTrack(song, creds, art),
      );
    }),
  );
  return perAlbum.flat();
};
