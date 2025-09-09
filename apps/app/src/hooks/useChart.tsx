import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import useSWR from "swr";
import { getArtistChart, getSongChart } from "../api/charts";
import { API_URL } from "../consts";

export const useScrobblesChartQuery = () =>
  useQuery({
    queryKey: ["scrobblesChart"],
    queryFn: () =>
      fetch(`${API_URL}/public/scrobbleschart`, {
        method: "GET",
      }).then((res) => res.json()),
  });

export const useSongChartQuery = (uri: string) =>
  useQuery({
    queryKey: ["songChart", uri],
    queryFn: () => getSongChart(uri),
  });

export const useArtistChartQuery = (uri: string) =>
  useQuery({
    queryKey: ["artistChart", uri],
    queryFn: () => getArtistChart(uri),
  });

export const useAlbumChartQuery = (uri: string) =>
  useQuery({
    queryKey: ["albumChart", uri],
    queryFn: () => getArtistChart(uri),
  });

export const useProfileChartQuery = (did: string) =>
  useQuery({
    queryKey: ["profileChart", did],
    queryFn: () => getArtistChart(did),
  });

function useChart() {
  const fetcher = (path: string) =>
    fetch(`${API_URL}${path}`, {
      method: "GET",
    }).then((res) => res.json());

  const { data: scrobblesChart } = useSWR("/public/scrobbleschart", fetcher);

  const getScrobblesChart = () => {
    return scrobblesChart || [];
  };

  const getSongChart = async (uri: string) => {
    const response = await axios.get(
      `${API_URL}/public/scrobbleschart?songuri=${uri}`,
    );
    if (response.status !== 200) {
      return [];
    }
    return response.data;
  };

  const getArtistChart = async (uri: string) => {
    const response = await axios.get(
      `${API_URL}/public/scrobbleschart?artisturi=${uri}`,
    );
    if (response.status !== 200) {
      return [];
    }
    return response.data;
  };

  const getAlbumChart = async (uri: string) => {
    const response = await axios.get(
      `${API_URL}/public/scrobbleschart?albumuri=${uri}`,
    );
    if (response.status !== 200) {
      return [];
    }
    return response.data;
  };

  const getProfileChart = async (did: string) => {
    const response = await axios.get(
      `${API_URL}/public/scrobbleschart?did=${did}`,
    );
    if (response.status !== 200) {
      return [];
    }
    return response.data;
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
