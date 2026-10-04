import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSetAtom } from "jotai";
import {
  getSongLikeState,
  like,
  type SongLikeState,
  unlike,
} from "../api/likes";
import { nowPlayingAtom } from "../atoms/nowplaying";
import { storiesAtom } from "../atoms/stories";
import { refreshLocalLikeState } from "../lib/uploadEngine";
import { storage } from "../storage";
import type { Story } from "../types/feed";

export function useStoryLike(story: Story | undefined) {
  const client = useQueryClient();
  const setStories = useSetAtom(storiesAtom);
  const setPlaying = useSetAtom(nowPlayingAtom);
  const uri = story?.trackUri ?? "";
  const key = ["song", "like-state", storage.getDid(), { uri }];
  const { data } = useQuery({
    queryKey: key,
    queryFn: () => getSongLikeState({ uri }),
    enabled: !!uri && !!storage.getToken(),
    staleTime: 30_000,
  });
  const liked = data?.liked ?? story?.liked ?? false;
  const publish = (trackUri: string, value: boolean) => {
    client.setQueryData<SongLikeState>(
      ["song", "like-state", storage.getDid(), { uri: trackUri }],
      { uri: trackUri, liked: value },
    );
    const update = (stories: Story[] | undefined) =>
      stories?.map((item) =>
        item.trackUri === trackUri ? { ...item, liked: value } : item,
      );
    client.setQueriesData<Story[]>({ queryKey: ["stories"] }, update);
    setStories((stories) => update(stories) ?? stories);
    setPlaying((track) =>
      track?.uri === trackUri ? { ...track, liked: value } : track,
    );
  };
  const mutation = useMutation({
    mutationFn: ({ uri, next }: { uri: string; next: boolean }) =>
      next ? like(uri) : unlike(uri),
    onMutate: async ({ uri, next }) => {
      await client.cancelQueries({
        queryKey: ["song", "like-state", storage.getDid(), { uri }],
      });
      await client.cancelQueries({ queryKey: ["stories"] });
      publish(uri, next);
    },
    onError: (_error, { uri, next }) => publish(uri, !next),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["navidrome", "starred-ids"] });
      void client.invalidateQueries({ queryKey: ["navidrome", "favorites"] });
      void client.invalidateQueries({ queryKey: ["song", "like-state"] });
      refreshLocalLikeState();
    },
  });
  return {
    liked,
    pending: mutation.isPending,
    toggle: () => {
      if (uri && !mutation.isPending) mutation.mutate({ uri, next: !liked });
    },
  };
}
