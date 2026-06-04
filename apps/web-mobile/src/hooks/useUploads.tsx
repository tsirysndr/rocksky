import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { deleteAlbum, deleteUpload, getUploads, uploadTrack } from "../api/uploads";

export const useUploadsQuery = (offset = 0, size = 1000) =>
  useQuery({
    queryKey: ["uploads", offset, size],
    queryFn: () => getUploads(offset, size),
    enabled: !!localStorage.getItem("token"),
  });

export const useInfiniteUploadsQuery = () =>
  useInfiniteQuery({
    queryKey: ["uploads-infinite"],
    queryFn: ({ pageParam = 0 }) => getUploads(pageParam as number, 50),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length === 50 ? allPages.flat().length : undefined,
    enabled: !!localStorage.getItem("token"),
  });

export const useUploadTrackMutation = () =>
  useMutation({
    mutationFn: (file: File) => uploadTrack(file),
  });

export const useDeleteUploadMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteUpload,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["uploads"] });
      queryClient.invalidateQueries({ queryKey: ["uploads-infinite"] });
    },
  });
};

export const useDeleteAlbumMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteAlbum,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["uploads"] });
      queryClient.invalidateQueries({ queryKey: ["uploads-infinite"] });
    },
  });
};
