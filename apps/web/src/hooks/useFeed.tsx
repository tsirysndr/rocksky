import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  getFeedByUri,
  getFeedGenerators,
  getFeed,
  getScrobbles,
} from "../api/feed";

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

export const useScrobblesQuery = (
  did: string,
  following = false,
  offset = 0,
  limit = 50,
) =>
  useQuery({
    queryKey: ["scrobbles", did, following, offset, limit],
    queryFn: async () => {
      const data = await getScrobbles(did, following, offset, limit);
      return data.scrobbles;
    },
  });

export const useScrobbleInfiniteQuery = (
  did: string,
  following = false,
  limit = 50,
) =>
  useInfiniteQuery({
    queryKey: ["infiniteScrobbles", did, following],
    queryFn: async ({ pageParam }) => {
      const data = await getScrobbles(did, following, pageParam, limit);
      return {
        scrobbles: data.scrobbles,
        nextOffset:
          data.scrobbles.length === limit ? pageParam + limit : undefined,
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextOffset,
    initialPageParam: 0,
  });
