import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UploadAlbum, UploadArtist, UploadedTrack } from "../api/uploads";
import {
  deleteAlbum,
  deleteAlbumById,
  deleteUpload,
  deleteUploadByTrackId,
  getUploadAlbums,
  getUploadArtists,
  getUploads,
  uploadTrack,
} from "../api/uploads";

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
    getNextPageParam: (lastPage: UploadedTrack[], allPages: UploadedTrack[][]) =>
      lastPage.length === 50 ? allPages.flat().length : undefined,
    enabled: !!localStorage.getItem("token"),
  });

export const useInfiniteUploadAlbumsQuery = () =>
  useInfiniteQuery({
    queryKey: ["uploads-albums-infinite"],
    queryFn: ({ pageParam = 0 }) => getUploadAlbums(pageParam as number, 50),
    initialPageParam: 0,
    getNextPageParam: (lastPage: UploadAlbum[], allPages: UploadAlbum[][]) =>
      lastPage.length === 50 ? allPages.flat().length : undefined,
    enabled: !!localStorage.getItem("token"),
  });

export const useInfiniteUploadArtistsQuery = () =>
  useInfiniteQuery({
    queryKey: ["uploads-artists-infinite"],
    queryFn: ({ pageParam = 0 }) => getUploadArtists(pageParam as number, 50),
    initialPageParam: 0,
    getNextPageParam: (lastPage: UploadArtist[], allPages: UploadArtist[][]) =>
      lastPage.length === 50 ? allPages.flat().length : undefined,
    enabled: !!localStorage.getItem("token"),
  });

export const useUploadTrackMutation = () =>
  useMutation({
    mutationFn: (file: File) => uploadTrack(file),
  });

const invalidateUploadCaches = (queryClient: ReturnType<typeof useQueryClient>) => {
  queryClient.invalidateQueries({ queryKey: ["uploads"] });
  queryClient.invalidateQueries({ queryKey: ["uploads-infinite"] });
  queryClient.invalidateQueries({ queryKey: ["uploads-albums-infinite"] });
  queryClient.invalidateQueries({ queryKey: ["uploads-artists-infinite"] });
  // Library browsing now runs off Navidrome — refresh those views too.
  queryClient.invalidateQueries({ queryKey: ["navidrome"] });
};

export const useDeleteUploadMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteUpload,
    onSuccess: () => invalidateUploadCaches(queryClient),
  });
};

export const useDeleteUploadByTrackIdMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteUploadByTrackId,
    onSuccess: () => invalidateUploadCaches(queryClient),
  });
};

export const useDeleteAlbumMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteAlbum,
    onSuccess: () => invalidateUploadCaches(queryClient),
  });
};

export const useDeleteAlbumByIdMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteAlbumById,
    onSuccess: () => invalidateUploadCaches(queryClient),
  });
};
