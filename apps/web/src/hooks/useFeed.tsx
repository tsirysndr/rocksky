import { useQuery } from "@tanstack/react-query";
import { client } from "../api";
import { getFeedByUri, getFeedGenerators } from "../api/feed";

export const useFeedQuery = (limit = 114) =>
  useQuery({
    queryKey: ["feed"],
    queryFn: () =>
      client.get("/xrpc/app.rocksky.scrobble.getScrobbles", {
        params: { limit },
      }),
    select: (res) => res.data.scrobbles || [],
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
