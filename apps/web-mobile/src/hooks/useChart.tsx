import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { API_URL } from "../consts";

const chartFetcher = (url: string) =>
  axios.get(url).then((r) => (r.status === 200 ? r.data : []));

export const useSongChartQuery = (uri: string) =>
  useQuery({
    queryKey: ["chart", "song", uri],
    queryFn: () =>
      chartFetcher(
        `${API_URL}/xrpc/app.rocksky.charts.getScrobblesChart?songuri=${uri}`,
      ),
    enabled: !!uri,
  });

export const useArtistChartQuery = (uri: string) =>
  useQuery({
    queryKey: ["chart", "artist", uri],
    queryFn: () =>
      chartFetcher(
        `${API_URL}/xrpc/app.rocksky.charts.getScrobblesChart?artisturi=${uri}`,
      ),
    enabled: !!uri,
  });

export const useAlbumChartQuery = (uri: string) =>
  useQuery({
    queryKey: ["chart", "album", uri],
    queryFn: () =>
      chartFetcher(
        `${API_URL}/xrpc/app.rocksky.charts.getScrobblesChart?albumuri=${uri}`,
      ),
    enabled: !!uri,
  });

export const useProfileChartQuery = (did: string) =>
  useQuery({
    queryKey: ["chart", "profile", did],
    queryFn: () =>
      chartFetcher(
        `${API_URL}/xrpc/app.rocksky.charts.getScrobblesChart?did=${did}`,
      ),
    enabled: !!did,
  });
