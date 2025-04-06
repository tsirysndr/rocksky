import useSWR from "swr";
import { API_URL } from "../consts";

function useNowPlaying() {
  const fetcher = (path: string) =>
    fetch(`${API_URL}${path}`, {
      method: "GET",
    }).then((res) => res.json());

  const { data } = useSWR("/now-playings", fetcher);

  return {
    nowPlayings: (data || []) as {
      id: string;
      title: string;
      artist: string;
      album_art: string;
      artist_uri?: string;
      uri: string;
      avatar: string;
      handle: string;
      did: string;
      created_at: string;
      track_id: string;
      track_uri: string;
    }[],
  };
}

export default useNowPlaying;
