import axios from "axios";
import { API_URL } from "../consts";

export const getScrobblesChart = () => {
  return [];
};

export const getSongChart = async (uri: string) => {
  const response = await axios.get(
    `${API_URL}/public/scrobbleschart?songuri=${uri}`
  );
  if (response.status !== 200) {
    return [];
  }
  return response.data;
};

export const getArtistChart = async (uri: string) => {
  const response = await axios.get(
    `${API_URL}/public/scrobbleschart?artisturi=${uri}`
  );
  if (response.status !== 200) {
    return [];
  }
  return response.data;
};

export const getAlbumChart = async (uri: string) => {
  const response = await axios.get(
    `${API_URL}/public/scrobbleschart?albumuri=${uri}`
  );
  if (response.status !== 200) {
    return [];
  }
  return response.data;
};

export const getProfileChart = async (did: string) => {
  const response = await axios.get(
    `${API_URL}/public/scrobbleschart?did=${did}`
  );
  if (response.status !== 200) {
    return [];
  }
  return response.data;
};
