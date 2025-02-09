import axios from "axios";
import { API_URL } from "../consts";

function useLibrary() {
  const getSongByUri = async (uri: string) => {
    const response = await axios.get(`${API_URL}/users/${uri}`);
    return {
      id: response.data?.xata_id,
      title: response.data?.title,
      artist: response.data?.artist,
      album: response.data?.album,
      cover: response.data?.album_art,
      tags: [],
      listeners: 1,
    };
  };

  const getArtists = async (did: string, limit = 30) => {
    const response = await axios.get(
      `${API_URL}/users/${did}/artists?size=${limit}`
    );
    return response.data;
  };

  const getAlbums = async (did: string, limit = 12) => {
    const response = await axios.get(
      `${API_URL}/users/${did}/albums?size=${limit}`
    );
    return response.data;
  };

  const getTracks = async (did: string, limit = 20) => {
    const response = await axios.get(
      `${API_URL}/users/${did}/tracks?size=${limit}`
    );
    return response.data;
  };

  const getLovedTracks = async (did: string, limit = 20) => {
    const response = await axios.get(
      `${API_URL}/users/${did}/loved?size=${limit}`
    );
    return response.data;
  };

  return {
    getSongByUri,
    getArtists,
    getAlbums,
    getTracks,
    getLovedTracks,
  };
}

export default useLibrary;
