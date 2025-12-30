import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { getFeedByUri, getFeedGenerators, getFeed } from "../api/feed";

export const useFeedQuery = (feed: string, limit = 114, cursor?: string) =>
  useQuery({
    queryKey: ["feed", feed],
    queryFn: async () => {
      const data = await getFeed(feed, limit, cursor);
      return data.songs;
    },
  });

export const useFeedByUriQuery = (uri: string) =>
  useQuery({
    queryKey: ["feed", uri],
    queryFn: () => getFeedByUri(uri),
  });

export const useFeedGeneratorsQuery = () =>
  useQuery({
    queryKey: ["feedGenerators"],
    queryFn: () => getFeedGenerators(),
  });

export const useFeedInfiniteQuery = (feed: string, limit = 30) =>
  useInfiniteQuery({
    queryKey: ["infiniteFeed", feed],
    queryFn: async ({ pageParam }) => {
      const data = await getFeed(feed, limit, pageParam);
      return {
        feed: data.songs,
        nextCursor: data.cursor,
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialPageParam: undefined as string | undefined,
  });
