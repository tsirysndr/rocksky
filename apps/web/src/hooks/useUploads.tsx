import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UploadedTrack } from "../api/uploads";
import {
  deleteUpload,
  getStreamUrl,
  getUploads,
  uploadTrack,
} from "../api/uploads";

export const useUploadsQuery = (offset?: number, size?: number) =>
  useQuery({
    queryKey: ["uploads", offset, size],
    queryFn: () => getUploads(offset, size),
  });

export const useUploadTrackMutation = (
  onProgress?: (percent: number) => void,
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => uploadTrack(file, onProgress),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["uploads"] });
    },
  });
};

export const useStreamUrlQuery = (uploadId: string | null) =>
  useQuery({
    queryKey: ["stream", uploadId],
    queryFn: () => getStreamUrl(uploadId!),
    enabled: !!uploadId,
    staleTime: 50 * 60 * 1000, // refresh before 1h presigned URL expires
  });

export const useInfiniteUploadsQuery = () =>
  useInfiniteQuery({
    queryKey: ["uploads", "infinite"],
    queryFn: ({ pageParam }: { pageParam: number }) => getUploads(pageParam, 50),
    initialPageParam: 0,
    getNextPageParam: (lastPage: UploadedTrack[], allPages: UploadedTrack[][]) => {
      if (lastPage.length < 50) return undefined;
      return allPages.flat().length;
    },
  });

export const useDeleteUploadMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteUpload,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["uploads"] });
    },
  });
};
