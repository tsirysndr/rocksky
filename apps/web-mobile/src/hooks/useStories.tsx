import { useQuery } from "@tanstack/react-query";
import { rocksky } from "../lib/rocksky";

export type Story = {
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
};

export type StoriesFilter = {
  feed?: string;
  following?: boolean;
};

export const useStoriesQuery = (filter: StoriesFilter = {}) =>
  useQuery({
    queryKey: ["stories", filter.feed, filter.following],
    queryFn: () => rocksky().stories(80, filter.feed, filter.following),
    select: (res) => (res.stories || []) as unknown as Story[],
  });
