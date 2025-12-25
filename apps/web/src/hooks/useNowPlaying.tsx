import { useQuery } from "@tanstack/react-query";
import { client } from "../api";

export type NowPlayings = {
  id: string;
  title: string;
  artist: string;
  albumArt: string;
  artistUri?: string;
  uri: string;
  avatar: string;
  handle: string;
  did: string;
  createdAt: string;
  trackId: string;
  trackUri: string;
}[];

export const useNowPlayingsQuery = () =>
  useQuery({
    queryKey: ["now-playings"],
    queryFn: () =>
      client.get<{ nowPlayings: NowPlayings }>(
        "/xrpc/app.rocksky.feed.getNowPlayings",
        { params: { size: 7 } },
      ),
    select: (res) => res.data.nowPlayings || [],
  });
