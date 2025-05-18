import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { getFeedByUri } from "../api/feed";
import { API_URL } from "../consts";

export const useFeedQuery = (size = 114) =>
  useQuery({
    queryKey: ["feed"],
    queryFn: () =>
      fetch(`${API_URL}/public/scrobbles?size=${size}`, {
        method: "GET",
      }).then((res) => res.json()),
    refetchInterval: 5000,
    placeholderData: (prev) => prev,
  });

export const useFeedInfiniteQuery = (size = 20) =>
  useInfiniteQuery({
    queryKey: ["infiniteFeed"],
    queryFn: async ({ pageParam = 0 }) => {
      const data = await fetch(
        `${API_URL}/public/scrobbles?size=${size}&offset=${pageParam * size}`,
        {
          method: "GET",
        }
      ).then((res) => res.json());
      return {
        feed: data,
        nextOffset: pageParam + 1,
      };
    },
    getNextPageParam: (lastPage) => {
      return lastPage.feed.length < size ? undefined : lastPage.nextOffset;
    },
    initialPageParam: 0,
    refetchOnMount: false,
  });

export const useFeedByUriQuery = (uri: string) =>
  useQuery({
    queryKey: ["feed", uri],
    queryFn: () => getFeedByUri(uri),
  });
