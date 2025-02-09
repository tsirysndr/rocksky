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

  return {
    getSongByUri,
  };
}

export default useLibrary;
