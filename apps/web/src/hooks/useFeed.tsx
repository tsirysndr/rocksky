import { useQuery } from "@tanstack/react-query";
import { client } from "../api";
import { getFeedByUri } from "../api/feed";

export const useFeedQuery = (limit = 114) =>
  useQuery({
    queryKey: ["feed"],
    queryFn: () =>
      client.get("/xrpc/app.rocksky.scrobble.getScrobbles", {
        params: { limit },
      }),
    refetchInterval: 5000,
    select: (res) => res.data.scrobbles || [],
  });

export const useFeedByUriQuery = (uri: string) =>
  useQuery({
    queryKey: ["feed", uri],
    queryFn: () => getFeedByUri(uri),
  });
