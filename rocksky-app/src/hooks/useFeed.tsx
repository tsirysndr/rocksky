import { useQuery } from "@tanstack/react-query";
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
  });

export const useFeedByUriQuery = (uri: string) =>
  useQuery({
    queryKey: ["feed", uri],
    queryFn: () => getFeedByUri(uri),
  });
