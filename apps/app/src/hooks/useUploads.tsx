import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  getAlbumTracks,
  getUploadAlbums,
  getUploadArtists,
  getUploads,
  type PickedAudioFile,
  type UploadFilters,
  uploadTrack,
} from "../api/uploads";

const TRACKS_PAGE = 50;
const ALBUMS_PAGE = 50;
// The web client lists artists in a single unpaged call. The API caps a page at
// 200 rows, and the cost there is the group-by rather than the limit, so one
// large page covers most libraries in one round-trip; scroll-loading still
// handles the ones it doesn't.
const ARTISTS_PAGE = 200;

// The uploaded catalogue barely moves between visits, so tab switches and
// screen remounts should render from cache instead of waiting on the network.
const STALE_TIME = 5 * 60 * 1000;
const GC_TIME = 30 * 60 * 1000;

export const useUploadsInfiniteQuery = (q: string, enabled = true) =>
  useInfiniteQuery({
    queryKey: ["uploads", "tracks", q],
    queryFn: ({ pageParam }) =>
      getUploads(pageParam, TRACKS_PAGE, q ? { q } : {}),
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) =>
      lastPage.length < TRACKS_PAGE ? undefined : pages.length * TRACKS_PAGE,
    enabled,
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
    refetchOnMount: false,
    placeholderData: keepPreviousData,
  });

export const useUploadAlbumsInfiniteQuery = (q: string, enabled = true) =>
  useInfiniteQuery({
    queryKey: ["uploads", "albums", q],
    queryFn: ({ pageParam }) =>
      getUploadAlbums(pageParam, ALBUMS_PAGE, q || undefined),
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) =>
      lastPage.length < ALBUMS_PAGE ? undefined : pages.length * ALBUMS_PAGE,
    enabled,
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
    refetchOnMount: false,
    placeholderData: keepPreviousData,
  });

export const useUploadArtistsInfiniteQuery = (q: string, enabled = true) =>
  useInfiniteQuery({
    queryKey: ["uploads", "artists", q],
    queryFn: ({ pageParam }) =>
      getUploadArtists(pageParam, ARTISTS_PAGE, q || undefined),
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) =>
      lastPage.length < ARTISTS_PAGE ? undefined : pages.length * ARTISTS_PAGE,
    enabled,
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
    refetchOnMount: false,
    placeholderData: keepPreviousData,
  });

export const useUploadCollectionTracksQuery = (filters: UploadFilters | null) =>
  useQuery({
    queryKey: ["uploads", "collection", filters],
    queryFn: () => getAlbumTracks(filters ?? {}),
    enabled: filters !== null,
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
  });

export const useUploadTrackMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      file,
      onProgress,
    }: {
      file: PickedAudioFile;
      onProgress?: (percent: number) => void;
    }) => uploadTrack(file, onProgress),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["uploads"] });
    },
  });
};
