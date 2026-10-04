import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
} from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useEffect, useMemo } from "react";
import {
  coverArtUrlOf,
  dedupeById,
  fetchNavidromeAlbum,
  fetchNavidromeAlbums,
  fetchNavidromeArtist,
  fetchNavidromeArtists,
  fetchNavidromeFavorites,
  fetchNavidromePlaylist,
  fetchNavidromePlaylists,
  type NavidromeAlbum,
  type NavidromeArtist,
  type NavidromeCredentials,
  type NavidromeSong,
  navidromeStreamUrl,
  resolveNavidromeApiKey,
  searchNavidrome,
} from "../api/navidrome";
import { profileAtom } from "../atoms/profile";
import {
  setEngineNavidromeCredentials,
  type UploadQueueTrack,
} from "../lib/uploadEngine";

const ALBUMS_PAGE = 50;

// The library barely moves between visits, so tab switches and remounts render
// from cache instead of waiting on the network.
const STALE_TIME = 5 * 60 * 1000;
const GC_TIME = 30 * 60 * 1000;

export const useNavidromeCredentials = () => {
  const profile = useAtomValue(profileAtom);
  const handle = profile?.handle;
  const query = useQuery<NavidromeCredentials>({
    queryKey: ["navidrome", "credentials", handle],
    enabled: !!handle,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    queryFn: async () => {
      const creds: NavidromeCredentials = {
        handle: handle as string,
        apiKey: await resolveNavidromeApiKey(),
      };
      // The playback engine lives outside React but needs these to build
      // stream URLs for a restored queue and to star/unstar what it plays.
      return creds;
    },
  });
  useEffect(() => {
    if (query.data) setEngineNavidromeCredentials(query.data);
  }, [query.data]);
  return query;
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
  mbId: song.musicBrainzId,
  navidromeId: song.id,
  liked: song.starred ? true : undefined,
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
    // The offset is how many albums have actually been fetched, not
    // pages × 50: a page that comes back short would otherwise make every
    // later offset skip past albums the user owns.
    getNextPageParam: (lastPage, pages) =>
      lastPage.length < ALBUMS_PAGE ? undefined : pages.flat().length,
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

export const useNavidromePlaylistsQuery = (enabled = true) => {
  const { data: creds } = useNavidromeCredentials();
  return useQuery({
    queryKey: ["navidrome", "playlists"],
    enabled: enabled && !!creds,
    queryFn: () => fetchNavidromePlaylists(creds as NavidromeCredentials),
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
    refetchOnMount: false,
  });
};

export const useNavidromePlaylistQuery = (playlistId: string | null) => {
  const { data: creds } = useNavidromeCredentials();
  return useQuery({
    queryKey: ["navidrome", "playlist", playlistId],
    enabled: !!creds && !!playlistId,
    queryFn: () =>
      fetchNavidromePlaylist(
        creds as NavidromeCredentials,
        playlistId as string,
      ),
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
    refetchOnMount: false,
  });
};

/**
 * Loved tracks. getStarred2 takes no query, so a search filters here — leaving
 * the tab untouched while every other one reacts would look broken.
 */
export const useNavidromeFavoritesQuery = (q: string, enabled = true) => {
  const { data: creds } = useNavidromeCredentials();
  const query = useQuery({
    queryKey: ["navidrome", "favorites"],
    enabled: enabled && !!creds,
    queryFn: () => fetchNavidromeFavorites(creds as NavidromeCredentials),
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
    refetchOnMount: false,
  });
  const needle = q.trim().toLowerCase();
  const songs = useMemo(() => {
    const all = query.data ?? [];
    if (!needle) return all;
    return all.filter((song) =>
      [song.title, song.artist, song.album].some((field) =>
        (field ?? "").toLowerCase().includes(needle),
      ),
    );
  }, [query.data, needle]);
  return { ...query, songs };
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
 * The navidrome id of an artist known only by name.
 *
 * getAlbum resolves an AT-URI as well as a navidrome id, so an uploaded
 * track's album opens directly; getArtist takes an id only, so the artist has
 * to be matched through search3 first.
 */
export const resolveArtistIdByName = async (
  creds: NavidromeCredentials,
  name: string,
): Promise<string | null> => {
  const { artists } = await searchNavidrome(creds, name, {
    artistCount: 20,
    songCount: 0,
    albumCount: 0,
  });
  const wanted = name.trim().toLowerCase();
  const exact = artists.find((a) => a.name.trim().toLowerCase() === wanted);
  return exact?.id ?? artists[0]?.id ?? null;
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
