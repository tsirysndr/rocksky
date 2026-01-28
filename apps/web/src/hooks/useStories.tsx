import { useQuery } from "@tanstack/react-query";
import { client } from "../api";

export type Stories = {
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

export const useStoriesQuery = () =>
  useQuery({
    queryKey: ["stories"],
    queryFn: () =>
      client.get<{ stories: Stories }>("/xrpc/app.rocksky.feed.getStories", {
        params: { size: 100 },
      }),
    select: (res) => res.data.stories || [],
  });
