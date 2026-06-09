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

export type StoriesFilter = {
  feed?: string;
  following?: boolean;
};

export const useStoriesQuery = (filter: StoriesFilter = {}) =>
  useQuery({
    queryKey: ["stories", filter.feed, filter.following],
    queryFn: () =>
      client.get<{ stories: Stories }>("/xrpc/app.rocksky.feed.getStories", {
        params: {
          size: 80,
          feed: filter.feed,
          following: filter.following,
        },
        headers: filter.following
          ? { Authorization: `Bearer ${localStorage.getItem("token")}` }
          : undefined,
      }),
    select: (res) => res.data.stories || [],
  });
