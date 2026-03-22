import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { getScrobbleByUri, getFeed, getScrobbles } from "../api/feed";
import { client } from "../api";

export const useFeedQuery = (size = 114) =>
  useQuery({
    queryKey: ["feed"],
    queryFn: () =>
      client
        .get(`/xrpc/app.rocksky.scrobble.getScrobbles`, {
          params: { limit: size },
        })
        .then((res) => res.data),
    refetchInterval: 5000,
    placeholderData: (prev) => prev,
  });

export const useFeedInfiniteQuery = (size = 20) =>
  useInfiniteQuery({
    queryKey: ["infiniteFeed"],
    queryFn: async ({ pageParam = 0 }) => {
      const data = await client
        .get(`/xrpc/app.rocksky.scrobble.getScrobbles`, {
          params: { limit: size, offset: pageParam * size },
        })
        .then((res) => res.data);
      return {
        feed: data.scrobbles ?? data,
        nextOffset: pageParam + 1,
      };
    },
    getNextPageParam: (lastPage) => {
      return lastPage.feed.length < size ? undefined : lastPage.nextOffset;
    },
    initialPageParam: 0,
    refetchOnMount: false,
  });

export const useScrobbleByUriQuery = (uri: string) =>
  useQuery({
    queryKey: ["scrobble", uri],
    queryFn: () => getScrobbleByUri(uri),
    enabled: !!uri,
  });

/** @deprecated Use useScrobbleByUriQuery instead */
export const useFeedByUriQuery = useScrobbleByUriQuery;

export const useFeedGeneratorQuery = (
  uri: string,
  limit?: number,
  cursor?: string,
) =>
  useQuery({
    queryKey: ["feedGenerator", uri, limit, cursor],
    queryFn: () => getFeed(uri, limit, cursor),
    enabled: !!uri,
  });

export const useScrobblesQuery = (
  did: string,
  following = false,
  offset = 0,
  limit = 50,
) =>
  useQuery({
    queryKey: ["scrobbles", did, following, offset, limit],
    queryFn: () => getScrobbles(did, following, offset, limit),
    enabled: !!did,
    placeholderData: (prev) => prev,
  });
