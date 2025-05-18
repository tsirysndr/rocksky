import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  getAlbum,
  getAlbums,
  getArtist,
  getArtistAlbums,
  getArtists,
  getArtistTracks,
  getLovedTracks,
  getSongByUri,
  getTracks,
} from "../api/library";

export const useSongByUriQuery = (uri: string) =>
  useQuery({
    queryKey: ["songByUri", uri],
    queryFn: () => getSongByUri(uri),
    enabled: !!uri,
  });

export const useArtistTracksQuery = (uri: string, limit = 10) =>
  useQuery({
    queryKey: ["artistTracks", uri, limit],
    queryFn: () => getArtistTracks(uri, limit),
    enabled: !!uri,
  });

export const useArtistAlbumsQuery = (uri: string, limit = 10) =>
  useQuery({
    queryKey: ["artistAlbums", uri, limit],
    queryFn: () => getArtistAlbums(uri, limit),
    enabled: !!uri,
  });

export const useArtistsQuery = (did: string, offset = 0, limit = 30) =>
  useQuery({
    queryKey: ["artists", did, offset, limit],
    queryFn: () => getArtists(did, offset, limit),
    enabled: !!did,
    placeholderData: (prev) => prev,
  });

export const useArtistsInfiniteQuery = (did: string, limit = 30) =>
  useInfiniteQuery({
    queryKey: ["infiniteArtists", did],
    queryFn: async ({ pageParam = 0 }) => {
      const data = await getArtists(did, pageParam * limit, limit);
      return {
        artists: data,
        nextOffset: pageParam + 1,
      };
    },
    getNextPageParam: (lastPage) => {
      return lastPage.artists.length < limit ? undefined : lastPage.nextOffset;
    },
    enabled: !!did,
    initialPageParam: 0,
    placeholderData: (prev) => prev,
    refetchOnMount: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

export const useAlbumsQuery = (did: string, offset = 0, limit = 12) =>
  useQuery({
    queryKey: ["albums", did, offset, limit],
    queryFn: () => getAlbums(did, offset, limit),
    enabled: !!did,
    placeholderData: (prev) => prev,
  });

export const useAlbumsInfiniteQuery = (did: string, limit = 12) =>
  useInfiniteQuery({
    queryKey: ["infiniteAlbums", did],
    queryFn: async ({ pageParam = 0 }) => {
      const data = await getAlbums(did, pageParam * limit, limit);
      return {
        albums: data,
        nextOffset: pageParam + 1,
      };
    },
    getNextPageParam: (lastPage) => {
      return lastPage.albums.length < limit ? undefined : lastPage.nextOffset;
    },
    enabled: !!did,
    initialPageParam: 0,
    placeholderData: (prev) => prev,
    refetchOnMount: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

export const useTracksQuery = (did: string, offset = 0, limit = 20) =>
  useQuery({
    queryKey: ["tracks", did, offset, limit],
    queryFn: () => getTracks(did, offset, limit),
    enabled: !!did,
    placeholderData: (prev) => prev,
  });

export const useInfiniteTracksQuery = (did: string, limit = 20) =>
  useInfiniteQuery({
    queryKey: ["infiniteTracks", did],
    queryFn: async ({ pageParam = 0 }) => {
      const data = await getTracks(did, pageParam * limit, limit);
      return {
        tracks: data,
        nextOffset: pageParam + 1,
      };
    },
    getNextPageParam: (lastPage) => {
      // If we got fewer items than requested, we're at the end
      return lastPage.tracks.length < limit ? undefined : lastPage.nextOffset;
    },
    enabled: !!did,
    initialPageParam: 0,
    placeholderData: (prev) => prev,
    refetchOnMount: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

export const useLovedTracksQuery = (did: string, offset = 0, limit = 20) =>
  useQuery({
    queryKey: ["lovedTracks", did, offset, limit],
    queryFn: () => getLovedTracks(did, offset, limit),
    enabled: !!did,
    placeholderData: (prev) => prev,
  });

export const useAlbumQuery = (did: string, rkey: string) =>
  useQuery({
    queryKey: ["album", did, rkey],
    queryFn: () => getAlbum(did, rkey),
    enabled: !!did && !!rkey,
  });

export const useArtistQuery = (did: string, rkey: string) =>
  useQuery({
    queryKey: ["artist", did, rkey],
    queryFn: () => getArtist(did, rkey),
    enabled: !!did && !!rkey,
  });
