import { useQuery } from "@tanstack/react-query";
import {
  getAlbum,
  getAlbums,
  getArtist,
  getArtistAlbums,
  getArtistListeners,
  getArtists,
  getArtistTracks,
  getLovedTracks,
  getSongByUri,
  getTracks,
  getTopArtists,
  getTopTracks,
} from "../api/library";

export const useSongByUriQuery = (uri: string) =>
  useQuery({
    queryKey: ["song", uri],
    queryFn: () => getSongByUri(uri),
    enabled: !!uri,
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

export const useArtistTracksQuery = (uri: string, limit = 10) =>
  useQuery({
    queryKey: ["artist-tracks", uri, limit],
    queryFn: () => getArtistTracks(uri, limit),
    enabled: !!uri,
  });

export const useArtistAlbumsQuery = (uri: string, limit = 10) =>
  useQuery({
    queryKey: ["artist-albums", uri, limit],
    queryFn: () => getArtistAlbums(uri, limit),
    enabled: !!uri,
  });

export const useArtistListenersQuery = (uri: string, limit: number) =>
  useQuery({
    queryKey: ["artist-listeners", uri, limit],
    queryFn: () => getArtistListeners(uri, limit),
    enabled: !!uri,
  });

export const useArtistsQuery = (did: string, offset = 0, limit = 30, startDate?: Date, endDate?: Date) =>
  useQuery({
    queryKey: ["artists", did, offset, limit, startDate, endDate],
    queryFn: () => getArtists(did, offset, limit, startDate, endDate),
    enabled: !!did,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    select: (data: any) => data?.artists?.map((x: any) => ({ ...x, scrobbles: x.playCount })),
  });

export const useAlbumsQuery = (did: string, offset = 0, limit = 12, startDate?: Date, endDate?: Date) =>
  useQuery({
    queryKey: ["albums", did, offset, limit, startDate, endDate],
    queryFn: () => getAlbums(did, offset, limit, startDate, endDate),
    enabled: !!did,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    select: (data: any) => data?.albums?.map((x: any) => ({ ...x, scrobbles: x.playCount })),
  });

export const useTracksQuery = (did: string, offset = 0, limit = 20, startDate?: Date, endDate?: Date) =>
  useQuery({
    queryKey: ["tracks", did, offset, limit, startDate, endDate],
    queryFn: () => getTracks(did, offset, limit, startDate, endDate),
    enabled: !!did,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    select: (data: any) => data?.tracks?.map((x: any) => ({ ...x, scrobbles: x.playCount })),
  });

export const useLovedTracksQuery = (did: string, offset = 0, limit = 20) =>
  useQuery({
    queryKey: ["loved-tracks", did, offset, limit],
    queryFn: () => getLovedTracks(did, offset, limit),
    enabled: !!did,
  });

export const useTopArtistsQuery = (offset = 0, limit = 20) =>
  useQuery({
    queryKey: ["top-artists", offset, limit],
    queryFn: () => getTopArtists(offset, limit),
  });

export const useTopTracksQuery = (offset = 0, limit = 20) =>
  useQuery({
    queryKey: ["top-tracks", offset, limit],
    queryFn: () => getTopTracks(offset, limit),
  });
