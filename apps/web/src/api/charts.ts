import axios from "axios";
import { API_URL } from "../consts";

export const getScrobblesChart = () => {
  return [];
};

export const getSongChart = async (uri: string) => {
  const response = await axios.get(
    `${API_URL}/xrpc/app.rocksky.charts.getScrobblesChart?songuri=${uri}`,
  );
  if (response.status !== 200) {
    return [];
  }
  return response.data;
};

export const getArtistChart = async (uri: string) => {
  const response = await axios.get(
    `${API_URL}/xrpc/app.rocksky.charts.getScrobblesChart?artisturi=${uri}`,
  );
  if (response.status !== 200) {
    return [];
  }
  return response.data;
};

export const getAlbumChart = async (uri: string) => {
  const response = await axios.get(
    `${API_URL}/xrpc/app.rocksky.charts.getScrobblesChart?albumuri=${uri}`,
  );
  if (response.status !== 200) {
    return [];
  }
  return response.data;
};

export const getProfileChart = async (did: string) => {
  const response = await axios.get(
    `${API_URL}/xrpc/app.rocksky.charts.getScrobblesChart?did=${did}`,
  );
  if (response.status !== 200) {
    return [];
  }
  return response.data;
};
