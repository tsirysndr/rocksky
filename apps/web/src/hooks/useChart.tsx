import { useQuery } from "@tanstack/react-query";
import useSWR from "swr";
import { client } from "../api";
import {
  getAlbumChart,
  getArtistChart,
  getProfileChart,
  getSongChart,
} from "../api/charts";
import { API_URL } from "../consts";

export const useScrobblesChartQuery = () =>
  useQuery({
    queryKey: ["scrobblesChart"],
    queryFn: () => client.get("/xrpc/app.rocksky.charts.getScrobblesChart"),
    select: ({ data }) => data.scrobbles || [],
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

function useChart() {
  const fetcher = (path: string) =>
    fetch(`${API_URL}${path}`, {
      method: "GET",
    }).then((res) => res.json());

  const { data: scrobblesChart } = useSWR(
    "/xrpc/app.rocksky.charts.getScrobblesChart",
    fetcher
  );

  const getScrobblesChart = () => {
    return scrobblesChart?.scrobbles || [];
  };

  const getSongChart = async (uri: string) => {
    const response = await client.get(
      "/xrpc/app.rocksky.charts.getScrobblesChart",
      { params: { songuri: uri } }
    );
    if (response.status !== 200) {
      return [];
    }
    return response.data.scrobbles;
  };

  const getArtistChart = async (uri: string) => {
    const response = await client.get(
      "/xrpc/app.rocksky.charts.getScrobblesChart",
      { params: { artisturi: uri } }
    );
    if (response.status !== 200) {
      return [];
    }
    return response.data.scrobbles;
  };

  const getAlbumChart = async (uri: string) => {
    const response = await client.get(
      "/xrpc/app.rocksky.charts.getScrobblesChart",
      { params: { albumuri: uri } }
    );
    if (response.status !== 200) {
      return [];
    }
    return response.data.scrobbles;
  };

  const getProfileChart = async (did: string) => {
    const response = await client.get(
      "/xrpc/app.rocksky.charts.getScrobblesChart",
      { params: { did } }
    );
    if (response.status !== 200) {
      return [];
    }
    return response.data.scrobbles;
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
