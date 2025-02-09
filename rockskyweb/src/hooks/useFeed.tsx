import axios from "axios";
import useSWR from "swr";
import { API_URL } from "../consts";

function useFeed() {
  const fetcher = (path: string) =>
    fetch(`${API_URL}${path}`, {
      method: "GET",
    }).then((res) => res.json());

  const { data } = useSWR("/public/scrobbles?size=114", fetcher);
  const getFeed = () => {
    return data || [];
  };

  const getFeedByUri = async (uri: string) => {
    const response = await axios.get(`${API_URL}/users/${uri}`);

    if (response.status !== 200) {
      return null;
    }

    return {
      id: response.data.track_id?.xata_id,
      title: response.data.track_id?.title,
      artist: response.data.track_id?.artist,
      album: response.data.track_id?.album,
      cover: response.data.track_id?.album_art,
      tags: [],
      listeners: 1,
    };
  };

  return {
    getFeed,
    getFeedByUri,
  };
}

export default useFeed;
