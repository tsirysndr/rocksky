import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { getUploads, type PickedAudioFile, uploadTrack } from "../api/uploads";

const TRACKS_PAGE = 50;

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

// Albums and artists are browsed through navidrome instead — see
// hooks/useNavidrome.tsx. The /uploads/albums and /uploads/artists endpoints
// group-by the user's whole upload set on every page.

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
