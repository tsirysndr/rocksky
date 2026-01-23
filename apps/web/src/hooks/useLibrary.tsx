import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  getAlbum,
  getAlbums,
  getAlbumsByGenre,
  getArtist,
  getArtistAlbums,
  getArtistListeners,
  getArtists,
  getArtistsByGenre,
  getArtistTracks,
  getLovedTracks,
  getSongByUri,
  getTracks,
  getTracksByGenre,
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

export const useArtistsQuery = (
  did: string,
  offset = 0,
  limit = 30,
  startDate?: Date,
  endDate?: Date,
) =>
  useQuery({
    queryKey: ["artists", did, offset, limit, startDate, endDate],
    queryFn: () => getArtists(did, offset, limit, startDate, endDate),
    enabled: !!did,
    select: (data) =>
      data?.artists.map((x) => ({
        ...x,
        scrobbles: x.playCount,
      })),
  });

export const useAlbumsQuery = (
  did: string,
  offset = 0,
  limit = 12,
  startDate?: Date,
  endDate?: Date,
) =>
  useQuery({
    queryKey: ["albums", did, offset, limit, startDate, endDate],
    queryFn: () => getAlbums(did, offset, limit, startDate, endDate),
    enabled: !!did,
    select: (data) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data?.albums.map((x: any) => ({
        ...x,
        scrobbles: x.playCount,
      })),
  });

export const useTracksQuery = (
  did: string,
  offset = 0,
  limit = 20,
  startDate?: Date,
  endDate?: Date,
) =>
  useQuery({
    queryKey: ["tracks", did, offset, limit, startDate, endDate],
    queryFn: () => getTracks(did, offset, limit, startDate, endDate),
    enabled: !!did,
    select: (data) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data?.tracks.map((x: any) => ({
        ...x,
        scrobbles: x.playCount,
      })),
  });

export const useLovedTracksQuery = (did: string, offset = 0, limit = 20) =>
  useQuery({
    queryKey: ["lovedTracks", did, offset, limit],
    queryFn: () => getLovedTracks(did, offset, limit),
    enabled: !!did,
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

export const useArtistListenersQuery = (uri: string, limit = 10) =>
  useQuery({
    queryKey: ["artistListeners", uri, limit],
    queryFn: () => getArtistListeners(uri, limit),
    enabled: !!uri,
    select: (data) => data.listeners,
  });

export const useTracksByGenreQuery = (genre: string, offset = 0, limit = 20) =>
  useQuery({
    queryKey: ["tracks", genre, offset, limit],
    queryFn: () => getTracksByGenre(genre, offset, limit),
    enabled: !!genre,
    select: (data) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data?.tracks.map((x: any) => ({
        ...x,
        scrobbles: x.playCount,
      })),
  });

export const useAlbumsByGenreQuery = (genre: string, offset = 0, limit = 20) =>
  useQuery({
    queryKey: ["albums", genre, offset, limit],
    queryFn: () => getAlbumsByGenre(genre, offset, limit),
    enabled: !!genre,
    select: (data) =>
      data?.albums.map((x) => ({
        ...x,
        scrobbles: x.playCount,
      })),
  });

export const useArtistsByGenreQuery = (genre: string, offset = 0, limit = 20) =>
  useQuery({
    queryKey: ["artists", genre, offset, limit],
    queryFn: () => getArtistsByGenre(genre, offset, limit),
    enabled: !!genre,
    select: (data) =>
      data?.artists.map((x) => ({
        ...x,
        scrobbles: x.playCount,
      })),
  });

export const useAlbumsByGenreInfiniteQuery = (genre: string, limit = 20) =>
  useInfiniteQuery({
    queryKey: ["infiniteAlbums", genre],
    queryFn: async ({ pageParam = 0 }) => {
      const data = await getAlbumsByGenre(genre, pageParam * limit, limit);
      return {
        albums: data?.albums.map((x) => ({
          ...x,
          scrobbles: x.playCount,
        })),
        nextOffset: pageParam + 1,
      };
    },
    getNextPageParam: (lastPage) => {
      if (!lastPage.albums || lastPage.albums.length < limit) return undefined;
      return lastPage.nextOffset;
    },
    enabled: !!genre,
    initialPageParam: 0,
  });

export const useArtistsByGenreInfiniteQuery = (genre: string, limit = 20) =>
  useInfiniteQuery({
    queryKey: ["infiniteArtists", genre],
    queryFn: async ({ pageParam = 0 }) => {
      const data = await getArtistsByGenre(genre, pageParam * limit, limit);
      return {
        artists: data?.artists.map((x) => ({
          ...x,
          scrobbles: x.playCount,
        })),
        nextOffset: pageParam + 1,
      };
    },
    getNextPageParam: (lastPage) => {
      if (!lastPage.artists || lastPage.artists.length < limit)
        return undefined;
      return lastPage.nextOffset;
    },
    enabled: !!genre,
    initialPageParam: 0,
  });

export const useTracksByGenreInfiniteQuery = (genre: string, limit = 20) =>
  useInfiniteQuery({
    queryKey: ["infiniteTracks", genre],
    queryFn: async ({ pageParam = 0 }) => {
      const data = await getTracksByGenre(genre, pageParam * limit, limit);
      return {
        tracks: data?.tracks.map((x: any) => ({
          ...x,
          scrobbles: x.playCount,
        })),
        nextOffset: pageParam + 1,
      };
    },
    getNextPageParam: (lastPage) => {
      if (!lastPage.tracks || lastPage.tracks.length < limit) return undefined;
      return lastPage.nextOffset;
    },
    enabled: !!genre,
    initialPageParam: 0,
  });
