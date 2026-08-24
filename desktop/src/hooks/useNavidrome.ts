import { songHash } from "@rocksky/sdk";
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { createApiKey, getApiKeys } from "../api/apikeys";
import {
  addTrackToNavidromePlaylist,
  createNavidromePlaylist,
  deleteNavidromePlaylist,
  fetchNavidromeAlbum,
  fetchNavidromeAlbums,
  fetchNavidromeArtist,
  fetchNavidromeArtists,
  fetchNavidromePlaylist,
  fetchNavidromePlaylists,
  getCoverArtUrl,
  getNavidromeStreamUrl,
  type NavidromeAlbum,
  type NavidromeArtist,
  type NavidromeCredentials,
  type NavidromePlaylist,
  type NavidromeSong,
  removeTrackFromNavidromePlaylist,
  renameNavidromePlaylist,
  searchNavidrome,
  setNavidromePlaylistDescription,
} from "../api/navidrome";
import { profileAtom } from "../atoms/profile";
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
      const existing = keys.find(
        (k) => k.name === NAVIDROME_KEY_NAME && k.enabled,
      );
      if (existing) return { handle: handle!, apiKey: existing.apiKey };
      const { data: created } = await createApiKey(
        NAVIDROME_KEY_NAME,
        "Navidrome API access",
      );
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
    // Navidrome has no Rocksky id — derive the canonical identity hash
    // (sha256(lower("title - artist - album"))), the same one the server and
    // every SDK use, so loved-song lookups and scrobble dedup line up.
    sha256: songHash(song.title, song.artist, song.album),
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
    queryFn: ({
      pageParam,
    }: {
      pageParam: number;
    }): Promise<NavidromeAlbum[]> => {
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

/**
 * Song-only search over the user's own uploads, for the playlist modal. Scoped
 * to their library by construction: navidrome only ever searches the caller's
 * own tracks, so nothing from the global catalogue can turn up here.
 */
export function useNavidromeSongSearchQuery(query: string) {
  const { data: creds } = useNavidromeCredentials();
  const q = query.trim();
  return useQuery({
    queryKey: ["navidrome", "song-search", q],
    enabled: !!creds && q.length >= 2,
    placeholderData: keepPreviousData,
    queryFn: (): Promise<NavidromeSong[]> =>
      searchNavidrome(creds!, q, {
        songCount: 30,
        albumCount: 0,
        artistCount: 0,
      }).then((r) => r.songs),
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

// -- Playlists ---------------------------------------------------------------

export function useNavidromePlaylistsQuery() {
  const { data: creds } = useNavidromeCredentials();
  return useQuery({
    queryKey: ["navidrome", "playlists"],
    enabled: !!creds,
    queryFn: (): Promise<NavidromePlaylist[]> =>
      fetchNavidromePlaylists(creds!),
  });
}

export function useNavidromePlaylistQuery(playlistId: string) {
  const { data: creds } = useNavidromeCredentials();
  return useQuery({
    queryKey: ["navidrome", "playlist", playlistId],
    enabled: !!creds && !!playlistId,
    queryFn: () => fetchNavidromePlaylist(creds!, playlistId),
  });
}

// Playlist mutations go through the Rocksky API, not straight to navidrome, so
// the change is mirrored to the user's PDS — see api/navidrome.ts. That also
// means they take no credentials: the API authenticates by JWT.
//
// A PlaylistMirrorWarning means the library change landed and only the PDS
// record didn't, so these still invalidate on error: the list has changed
// either way, and the caller decides how to surface the warning.
function invalidatePlaylists(
  queryClient: ReturnType<typeof useQueryClient>,
  id?: string,
) {
  queryClient.invalidateQueries({ queryKey: ["navidrome", "playlists"] });
  if (id)
    queryClient.invalidateQueries({ queryKey: ["navidrome", "playlist", id] });

  // The same change lands in the user's repo as an app.rocksky.playlist
  // record, so the ATProto views of it — the profile playlists grid
  // (["playlists", did, filter]) and the playlist page (["playlist", did,
  // rkey]) — are stale now too. Distinct key prefixes from the navidrome ones
  // above, so neither invalidation catches the other.
  //
  // Marking them stale is the point, not the refetch: the AppView only has the
  // row once jetstream ingests the commit, so a refetch fired right now would
  // race it and likely miss. Neither query is mounted while the library modal
  // is open, so this defers the fetch to whenever the user opens their
  // profile — by which time ingest has long since caught up.
  queryClient.invalidateQueries({ queryKey: ["playlists"] });
  queryClient.invalidateQueries({ queryKey: ["playlist"] });
}

export function useCreatePlaylistMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      name: string;
      description?: string;
      songIds?: string[];
    }) => createNavidromePlaylist(input),
    onSettled: () => invalidatePlaylists(queryClient),
  });
}

export function useDeletePlaylistMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteNavidromePlaylist(id),
    onSettled: () => invalidatePlaylists(queryClient),
  });
}

export function useRenamePlaylistMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      name,
      description,
    }: {
      id: string;
      name: string;
      description?: string;
    }) => {
      await renameNavidromePlaylist(id, name);
      if (description !== undefined) {
        await setNavidromePlaylistDescription(id, description);
      }
    },
    onSettled: (_d, _e, { id }) => invalidatePlaylists(queryClient, id),
  });
}

export function useAddTrackToPlaylistMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      playlistId,
      songId,
    }: {
      playlistId: string;
      songId: string;
    }) => addTrackToNavidromePlaylist(playlistId, songId),
    onSettled: (_d, _e, { playlistId }) =>
      invalidatePlaylists(queryClient, playlistId),
  });
}

export function useRemoveTrackFromPlaylistMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      playlistId,
      index,
    }: {
      playlistId: string;
      index: number;
    }) => removeTrackFromNavidromePlaylist(playlistId, index),
    onSettled: (_d, _e, { playlistId }) =>
      invalidatePlaylists(queryClient, playlistId),
  });
}
