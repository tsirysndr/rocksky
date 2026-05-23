import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

export const useDeleteUploadMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteUpload,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["uploads"] });
    },
  });
};
