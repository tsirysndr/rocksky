import axios from "axios";
import useSWR from "swr";
import { API_URL } from "../consts";

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
      `${API_URL}/public/scrobbleschart?songuri=${uri}`
    );
    if (response.status !== 200) {
      return [];
    }
    return response.data;
  };

  const getArtistChart = async (uri: string) => {
    const response = await axios.get(
      `${API_URL}/public/scrobbleschart?artisturi=${uri}`
    );
    if (response.status !== 200) {
      return [];
    }
    return response.data;
  };

  const getAlbumChart = async (uri: string) => {
    const response = await axios.get(
      `${API_URL}/public/scrobbleschart?albumuri=${uri}`
    );
    if (response.status !== 200) {
      return [];
    }
    return response.data;
  };

  const getProfileChart = async (did: string) => {
    const response = await axios.get(
      `${API_URL}/public/scrobbleschart?did=${did}`
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
