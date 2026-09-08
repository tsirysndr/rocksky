import { useQuery } from "@tanstack/react-query";
import {
  getAlbumChart,
  getArtistChart,
  getGenreChart,
  getProfileChart,
  getSongChart,
} from "../api/charts";
import { rocksky } from "../lib/rocksky";

export const useScrobblesChartQuery = () =>
  useQuery({
    queryKey: ["scrobblesChart"],
    queryFn: () => rocksky().scrobblesChart({}),
    select: (data) => data.scrobbles || [],
  });

// getScrobblesChart falls back to the site-wide chart when its filter param is
// missing, so every scoped query must stay disabled until it has one.
export const useSongChartQuery = (uri?: string) =>
  useQuery({
    queryKey: ["songChart", uri],
    queryFn: () => getSongChart(uri!),
    enabled: !!uri,
    select: (data) => data.scrobbles || [],
  });

export const useArtistChartQuery = (uri?: string) =>
  useQuery({
    queryKey: ["artistChart", uri],
    queryFn: () => getArtistChart(uri!),
    enabled: !!uri,
    select: (data) => data.scrobbles || [],
  });

export const useAlbumChartQuery = (uri?: string) =>
  useQuery({
    queryKey: ["albumChart", uri],
    queryFn: () => getAlbumChart(uri!),
    enabled: !!uri,
    select: (data) => data.scrobbles || [],
  });

export const useProfileChartQuery = (did?: string) =>
  useQuery({
    queryKey: ["profileChart", did],
    queryFn: () => getProfileChart(did!),
    enabled: !!did,
    select: (data) => data.scrobbles || [],
  });

export const useGenreChartQuery = (genre?: string) =>
  useQuery({
    queryKey: ["genreChart", genre],
    queryFn: () => getGenreChart(genre!),
    enabled: !!genre,
    select: (data) => data.scrobbles || [],
  });

