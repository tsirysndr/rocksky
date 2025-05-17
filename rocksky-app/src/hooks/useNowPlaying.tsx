import { useQuery } from "@tanstack/react-query";
import { API_URL } from "../consts";

export type NowPlayings = {
  id: string;
  title: string;
  artist: string;
  album_art: string;
  artist_uri?: string;
  album_uri?: string;
  uri: string;
  avatar: string;
  handle: string;
  did: string;
  created_at: string;
  track_id: string;
  track_uri: string;
}[];

export const useNowPlayingsQuery = () =>
  useQuery<NowPlayings>({
    queryKey: ["now-playings"],
    queryFn: () =>
      fetch(`${API_URL}/now-playings?size=7`, {
        method: "GET",
      }).then((res) => res.json()),
    refetchInterval: 5000,
  });
