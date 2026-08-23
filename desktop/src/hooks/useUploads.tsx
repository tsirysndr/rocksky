import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteAlbum, deleteAlbumById, deleteUpload, deleteUploadByTrackId, uploadTrack } from "../api/uploads";

export const useUploadTrackMutation = (
  onProgress?: (percent: number) => void,
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => uploadTrack(file, onProgress),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["navidrome"] });
    },
  });
};

export const useDeleteUploadMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteUpload,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["navidrome"] });
    },
  });
};

export const useDeleteUploadByTrackIdMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteUploadByTrackId,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["navidrome"] });
    },
  });
};

export const useDeleteAlbumMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteAlbum,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["navidrome"] });
    },
  });
};

export const useDeleteAlbumByIdMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteAlbumById,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["navidrome"] });
    },
  });
};
