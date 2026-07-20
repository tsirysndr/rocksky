import { RockskyClient } from "client";
import { atom, useAtom } from "jotai";

/** Set of song URIs the user has liked (loved). */
export const likedUrisAtom = atom<Set<string>>(new Set<string>());

/**
 * Returns a toggle(uri) that optimistically flips the liked state and calls the
 * like/dislike xrpc, reverting on failure.
 */
export function useToggleLike(token?: string) {
  const [liked, setLiked] = useAtom(likedUrisAtom);

  return async function toggle(uri?: string) {
    if (!uri || !token) return;
    const wasLiked = liked.has(uri);
    const optimistic = new Set(liked);
    if (wasLiked) optimistic.delete(uri);
    else optimistic.add(uri);
    setLiked(optimistic);

    try {
      const client = new RockskyClient(token);
      if (wasLiked) await client.dislikeSong(uri);
      else await client.likeSong(uri);
    } catch {
      // revert
      setLiked((cur) => {
        const reverted = new Set(cur);
        if (wasLiked) reverted.add(uri);
        else reverted.delete(uri);
        return reverted;
      });
    }
  };
}
