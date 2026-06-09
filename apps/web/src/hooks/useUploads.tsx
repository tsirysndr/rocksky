import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UploadAlbum, UploadArtist, UploadedTrack } from "../api/uploads";
import {
  deleteAlbum,
  deleteUpload,
  getAlbumTracks,
  getStreamUrl,
  getUploadAlbums,
  getUploadArtists,
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

export const useInfiniteUploadsQuery = (q?: string) =>
  useInfiniteQuery({
    queryKey: ["uploads", "infinite", q],
    queryFn: ({ pageParam }: { pageParam: number }) => getUploads(pageParam, 50, q),
    initialPageParam: 0,
    getNextPageParam: (lastPage: UploadedTrack[], allPages: UploadedTrack[][]) => {
      if (lastPage.length < 50) return undefined;
      return allPages.flat().length;
    },
    placeholderData: keepPreviousData,
  });

export const useInfiniteUploadAlbumsQuery = (q?: string) =>
  useInfiniteQuery({
    queryKey: ["uploads", "albums", "infinite", q],
    queryFn: ({ pageParam }: { pageParam: number }) =>
      getUploadAlbums(pageParam, 50, q),
    initialPageParam: 0,
    getNextPageParam: (lastPage: UploadAlbum[], allPages: UploadAlbum[][]) => {
      if (lastPage.length < 50) return undefined;
      return allPages.flat().length;
    },
    placeholderData: keepPreviousData,
  });

export const useInfiniteUploadArtistsQuery = (q?: string) =>
  useInfiniteQuery({
    queryKey: ["uploads", "artists", "infinite", q],
    queryFn: ({ pageParam }: { pageParam: number }) =>
      getUploadArtists(pageParam, 50, q),
    initialPageParam: 0,
    getNextPageParam: (lastPage: UploadArtist[], allPages: UploadArtist[][]) => {
      if (lastPage.length < 50) return undefined;
      return allPages.flat().length;
    },
    placeholderData: keepPreviousData,
  });

export const useAlbumTracksQuery = (albumUri?: string, albumArtist?: string, albumName?: string) =>
  useQuery({
    queryKey: ["albumTracks", albumUri, albumArtist, albumName],
    queryFn: () => getAlbumTracks(albumUri, albumArtist, albumName),
    enabled: !!(albumUri || (albumArtist && albumName)),
  });

export const useDeleteUploadMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteUpload,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["uploads"] });
      queryClient.invalidateQueries({ queryKey: ["albumTracks"] });
    },
  });
};

export const useDeleteAlbumMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteAlbum,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["uploads"] });
      queryClient.invalidateQueries({ queryKey: ["albumTracks"] });
    },
  });
};
