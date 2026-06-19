import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { profileAtom } from "../atoms/profile";
import { createApiKey, getApiKeys } from "../api/apikeys";
import {
  fetchNavidromeAlbum,
  fetchNavidromeAlbums,
  fetchNavidromeArtist,
  fetchNavidromeArtists,
  getCoverArtUrl,
  getNavidromeStreamUrl,
  searchNavidrome,
  type NavidromeAlbum,
  type NavidromeArtist,
  type NavidromeCredentials,
  type NavidromeSong,
} from "../api/navidrome";
import type { QueueTrack } from "../atoms/queue";

const NAVIDROME_KEY_NAME = "navidrome";

export function useNavidromeCredentials() {
  const profile = useAtomValue(profileAtom);
  const handle = profile?.handle;
  return useQuery<NavidromeCredentials>({
    queryKey: ["navidrome", "credentials", handle],
    enabled: !!handle,
    staleTime: Infinity,
    queryFn: async () => {
      const { data: keys } = await getApiKeys(0, 100);
      const existing = keys.find((k) => k.name === NAVIDROME_KEY_NAME && k.enabled);
      if (existing) return { handle: handle!, apiKey: existing.apiKey };
      const { data: created } = await createApiKey(NAVIDROME_KEY_NAME, "Navidrome API access");
      return { handle: handle!, apiKey: created.apiKey };
    },
  });
}

export function songToQueueTrack(
  song: NavidromeSong,
  creds: NavidromeCredentials,
  albumArtOverride?: string | null,
): QueueTrack {
  const albumArt =
    albumArtOverride !== undefined
      ? albumArtOverride
      : song.coverArt
        ? getCoverArtUrl(creds, song.coverArt)
        : null;
  return {
    uploadId: song.id,
    title: song.title,
    artist: song.artist,
    albumArtist: song.albumArtist ?? song.artist,
    album: song.album,
    albumArt,
    duration: song.duration * 1000,
    sha256: "",
    songUri: "",
    trackNumber: song.track ?? null,
    genre: song.genre ?? null,
    streamUrl: getNavidromeStreamUrl(creds, song.id),
  };
}

export function useNavidromeTracksQuery(q?: string) {
  const { data: creds } = useNavidromeCredentials();
  return useInfiniteQuery({
    queryKey: ["navidrome", "tracks", q],
    enabled: !!creds,
    placeholderData: keepPreviousData,
    initialPageParam: 0,
    queryFn: ({ pageParam }: { pageParam: number }): Promise<NavidromeSong[]> =>
      searchNavidrome(creds!, q ?? "", {
        songOffset: pageParam,
        songCount: 50,
        albumCount: 0,
        artistCount: 0,
      }).then((r) => r.songs),
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.length < 50) return undefined;
      return allPages.flat().length;
    },
  });
}

export function useNavidromeAlbumsQuery(q?: string) {
  const { data: creds } = useNavidromeCredentials();
  return useInfiniteQuery({
    queryKey: ["navidrome", "albums", q],
    enabled: !!creds,
    placeholderData: keepPreviousData,
    initialPageParam: 0,
    queryFn: ({ pageParam }: { pageParam: number }): Promise<NavidromeAlbum[]> => {
      if (q) {
        return searchNavidrome(creds!, q, {
          albumOffset: pageParam,
          albumCount: 50,
          songCount: 0,
          artistCount: 0,
        }).then((r) => r.albums);
      }
      return fetchNavidromeAlbums(creds!, pageParam, 50);
    },
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.length < 50) return undefined;
      return allPages.flat().length;
    },
  });
}

export function useNavidromeArtistsQuery(q?: string) {
  const { data: creds } = useNavidromeCredentials();
  return useQuery({
    queryKey: ["navidrome", "artists", q],
    enabled: !!creds,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<NavidromeArtist[]> => {
      if (q) {
        const result = await searchNavidrome(creds!, q, {
          artistCount: 200,
          songCount: 0,
          albumCount: 0,
        });
        return result.artists;
      }
      return fetchNavidromeArtists(creds!);
    },
  });
}

export function useNavidromeAlbumQuery(albumId: string) {
  const { data: creds } = useNavidromeCredentials();
  return useQuery({
    queryKey: ["navidrome", "album", albumId],
    enabled: !!creds && !!albumId,
    staleTime: 5 * 60 * 1000,
    queryFn: () => fetchNavidromeAlbum(creds!, albumId),
  });
}

export function useNavidromeArtistQuery(artistId: string) {
  const { data: creds } = useNavidromeCredentials();
  return useQuery({
    queryKey: ["navidrome", "artist", artistId],
    enabled: !!creds && !!artistId,
    staleTime: 5 * 60 * 1000,
    queryFn: () => fetchNavidromeArtist(creds!, artistId),
  });
}
