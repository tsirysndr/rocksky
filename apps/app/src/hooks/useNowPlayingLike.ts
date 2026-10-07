import { useQuery } from "@tanstack/react-query";
import { useAtom, useAtomValue } from "jotai";
import { useEffect } from "react";
import { getSongLikeState } from "../api/likes";
import { authTokenAtom } from "../atoms/auth";
import { nowPlayingAtom, playerAtom } from "../atoms/nowplaying";
import { storage } from "../storage";

/** Resolve the user's love independently of a remote player's optional flag. */
export function useNowPlayingLike() {
  const [track, setTrack] = useAtom(nowPlayingAtom);
  const player = useAtomValue(playerAtom);
  const token = useAtomValue(authTokenAtom);
  const uri = track?.uri ?? "";
  const { data } = useQuery({
    queryKey: ["song", "like-state", storage.getDid(), { uri }],
    queryFn: () => getSongLikeState({ uri }),
    enabled: !!token && !!uri && player !== "local" && player !== "cast",
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
  useEffect(() => {
    if (player === "local" || player === "cast" || !data || data.liked === track?.liked) return;
    setTrack((current) =>
      current?.uri === uri ? { ...current, liked: data.liked } : current,
    );
  }, [data, uri, player, track?.liked, setTrack]);
}
