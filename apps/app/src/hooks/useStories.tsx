import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { getStories } from "../api/feed";
import {
  feedAtom,
  feedGeneratorUriAtom,
  followingFeedAtom,
} from "../atoms/feed";
import type { Story } from "../types/feed";

export type { Story };

export const dedupeStories = (stories: Story[]): Story[] => [
  ...new Map(
    stories.map((s) => [`${s.trackId}-${s.did}-${s.createdAt}`, s]),
  ).values(),
];

export const useStoriesQuery = () => {
  const category = useAtomValue(feedAtom);
  const feedUri = useAtomValue(feedGeneratorUriAtom);
  const following = useAtomValue(followingFeedAtom);
  const feed =
    !following && category !== "all" && feedUri ? feedUri : undefined;

  return useQuery({
    queryKey: ["stories", feed, following],
    queryFn: () =>
      getStories({ size: 80, feed, following: following || undefined }),
    select: dedupeStories,
    refetchInterval: 60_000,
  });
};
