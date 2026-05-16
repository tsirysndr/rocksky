import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { getFeed, getFeedGenerators, getScrobbles, getScrobbleByUri } from "../api/feed";

export const useFeedGeneratorsQuery = () =>
  useQuery({
    queryKey: ["feedGenerators"],
    queryFn: getFeedGenerators,
  });

export const useFeedInfiniteQuery = (feed: string, limit = 20) =>
  useInfiniteQuery({
    queryKey: ["infiniteFeed", feed],
    queryFn: async ({ pageParam }) => {
      const data = await getFeed(feed, limit, pageParam as string | undefined);
      return { feed: data.songs, nextCursor: data.cursor };
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialPageParam: undefined as string | undefined,
    enabled: !!feed,
  });

export const useScrobbleInfiniteQuery = (
  did: string,
  following = false,
  limit = 20,
) =>
  useInfiniteQuery({
    queryKey: ["infiniteScrobbles", did, following],
    queryFn: async ({ pageParam }) => {
      const data = await getScrobbles(
        did,
        following,
        pageParam as number,
        limit,
      );
      return {
        scrobbles: data.scrobbles,
        nextOffset:
          data.scrobbles.length === limit
            ? (pageParam as number) + limit
            : undefined,
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextOffset,
    initialPageParam: 0,
    enabled: !!did,
  });

export const useScrobbleByUriQuery = (uri: string) =>
  useQuery({
    queryKey: ["scrobble", uri],
    queryFn: () => getScrobbleByUri(uri),
    enabled: !!uri,
  });

/** @deprecated Use useScrobbleByUriQuery instead */
export const useFeedByUriQuery = useScrobbleByUriQuery;
