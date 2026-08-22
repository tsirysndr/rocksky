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
  liked?: boolean;
  likesCount?: number;
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
        // Always authenticate when a token exists — the server uses the viewer
        // identity to fill each story's `liked` state (and `following` needs it).
        headers: localStorage.getItem("token")
          ? { Authorization: `Bearer ${localStorage.getItem("token")}` }
          : undefined,
      }),
    select: (res) => res.data.stories || [],
  });
