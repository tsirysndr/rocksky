import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAtomValue, useSetAtom } from "jotai";
import {
  getSongLikeState,
  setTrackLiked,
  type SongLikeState,
} from "../api/likes";
import { authTokenAtom } from "../atoms/auth";
import { nowPlayingAtom } from "../atoms/nowplaying";
import { storiesAtom } from "../atoms/stories";
import { refreshLocalLikeState } from "../lib/uploadEngine";
import { storage } from "../storage";
import { Alert } from "react-native";
import type { Story } from "../types/feed";

export function useStoryLike(
  story:
    | { trackUri?: string | null; trackId?: string | null; liked?: boolean }
    | undefined,
) {
  const token = useAtomValue(authTokenAtom);
  const client = useQueryClient();
  const setStories = useSetAtom(storiesAtom);
  const setPlaying = useSetAtom(nowPlayingAtom);
  const uri = story?.trackUri ?? "";
  const identity = uri ? { uri } : { trackId: story?.trackId };
  const key = ["song", "like-state", storage.getDid(), identity];
  const { data } = useQuery({
    queryKey: key,
    queryFn: () => getSongLikeState({ uri }),
    enabled: !!uri && !!token,
    staleTime: 30_000,
  });
  const liked = !!token && (data?.liked ?? story?.liked ?? false);
  const publish = (trackUri: string, value: boolean) => {
    client.setQueryData<SongLikeState>(
      ["song", "like-state", storage.getDid(), identity],
      { uri: trackUri, liked: value },
    );
    const update = (stories: Story[] | undefined) =>
      stories?.map((item) =>
        (
          trackUri
            ? item.trackUri === trackUri
            : item.trackId === story?.trackId
        )
          ? { ...item, liked: value }
          : item,
      );
    client.setQueriesData<Story[]>({ queryKey: ["stories"] }, update);
    setStories((stories) => update(stories) ?? stories);
    setPlaying((track) =>
      trackUri && track?.uri === trackUri ? { ...track, liked: value } : track,
    );
  };
  const mutation = useMutation({
    mutationFn: ({ uri, next }: { uri: string; next: boolean }) =>
      setTrackLiked({ trackUri: uri, trackId: story?.trackId }, next),
    onMutate: async ({ uri, next }) => {
      await client.cancelQueries({
        queryKey: key,
      });
      await client.cancelQueries({ queryKey: ["stories"] });
      publish(uri, next);
    },
    onError: (error, { uri, next }) => {
      publish(uri, !next);
      Alert.alert(
        "Could not update like",
        error instanceof Error ? error.message : "Please try again.",
      );
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["navidrome", "starred-ids"] });
      void client.invalidateQueries({ queryKey: ["navidrome", "favorites"] });
      void client.invalidateQueries({ queryKey: ["lovedTracks"] });
      refreshLocalLikeState();
    },
  });
  return {
    liked,
    pending: mutation.isPending,
    toggle: () => {
      if ((uri || story?.trackId) && !mutation.isPending)
        mutation.mutate({ uri, next: !liked });
    },
  };
}
