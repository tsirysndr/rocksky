import { useQuery } from "@tanstack/react-query";
import { rocksky } from "../lib/rocksky";

/** The live story shape — refines the lexicon FeedStoryView (the AppView
 * always fills these fields) and adds the viewer's like state. */
export type Story = {
  id: string;
  title: string;
  artist: string;
  albumArt: string;
  artistUri?: string;
  uri: string;
  avatar: string;
  handle: string;
  did: string;
  createdAt: string;
  trackId: string;
  trackUri: string;
  liked?: boolean;
  likesCount?: number;
};

export type Stories = Story[];

export type StoriesFilter = {
  feed?: string;
  following?: boolean;
};

export const useStoriesQuery = (filter: StoriesFilter = {}) =>
  useQuery({
    queryKey: ["stories", filter.feed, filter.following],
    // The shared client always authenticates when a token exists — the server
    // uses the viewer identity to fill each story's `liked` state (and
    // `following` needs it).
    queryFn: () => rocksky().stories(80, filter.feed, filter.following),
    select: (res) => (res.stories ?? []) as Stories,
  });
