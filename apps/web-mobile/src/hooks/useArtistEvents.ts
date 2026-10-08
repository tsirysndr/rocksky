import { useInfiniteQuery } from "@tanstack/react-query";
import { getArtistEvents } from "../api/events";

const PAGE_SIZE = 20;

export function useArtistEvents(uri?: string) {
  const viewer = localStorage.getItem("token")
    ? localStorage.getItem("did")
    : null;
  return useInfiniteQuery({
    queryKey: ["artistEvents", uri, viewer],
    enabled: !!uri,
    initialPageParam: 0,
    queryFn: ({ pageParam }) => getArtistEvents(uri!, PAGE_SIZE, pageParam),
    getNextPageParam: (lastPage, _pages, offset) =>
      lastPage.length === PAGE_SIZE ? offset + PAGE_SIZE : undefined,
    staleTime: 60_000,
  });
}
