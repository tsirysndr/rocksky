import { useQuery } from "@tanstack/react-query";
import useSWR from "swr";
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

export const useSongChartQuery = (uri: string) =>
  useQuery({
    queryKey: ["songChart", uri],
    queryFn: () => getSongChart(uri),
    select: (data) => data.scrobbles || [],
  });

export const useArtistChartQuery = (uri: string) =>
  useQuery({
    queryKey: ["artistChart", uri],
    queryFn: () => getArtistChart(uri),
    select: (data) => data.scrobbles || [],
  });

export const useAlbumChartQuery = (uri: string) =>
  useQuery({
    queryKey: ["albumChart", uri],
    queryFn: () => getAlbumChart(uri),
    select: (data) => data.scrobbles || [],
  });

export const useProfileChartQuery = (did: string) =>
  useQuery({
    queryKey: ["profileChart", did],
    queryFn: () => getProfileChart(did),
    select: (data) => data.scrobbles || [],
  });

export const useGenreChartQuery = (genre: string) =>
  useQuery({
    queryKey: ["genreChart", genre],
    queryFn: () => getGenreChart(genre),
    select: (data) => data.scrobbles || [],
  });

function useChart() {
  const { data: scrobblesChart } = useSWR(
    "/xrpc/app.rocksky.charts.getScrobblesChart",
    () => rocksky().scrobblesChart({}),
  );

  const getScrobblesChart = () => {
    return scrobblesChart?.scrobbles || [];
  };

  const getSongChart = async (uri: string) => {
    const data = await rocksky().scrobblesChart({ songuri: uri });
    return data.scrobbles ?? [];
  };

  const getArtistChart = async (uri: string) => {
    const data = await rocksky().scrobblesChart({ artisturi: uri });
    return data.scrobbles ?? [];
  };

  const getAlbumChart = async (uri: string) => {
    const data = await rocksky().scrobblesChart({ albumuri: uri });
    return data.scrobbles ?? [];
  };

  const getProfileChart = async (did: string) => {
    const data = await rocksky().scrobblesChart({ did });
    return data.scrobbles ?? [];
  };

  return {
    getScrobblesChart,
    getSongChart,
    getArtistChart,
    getAlbumChart,
    getProfileChart,
  };
}

export default useChart;
