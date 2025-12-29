import { useQuery } from "@tanstack/react-query";
import { getFeedByUri, getFeedGenerators, getFeed } from "../api/feed";

export const useFeedQuery = (feed: string, limit = 114, cursor?: string) =>
  useQuery({
    queryKey: ["feed", feed],
    queryFn: () => getFeed(feed, limit, cursor),
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
