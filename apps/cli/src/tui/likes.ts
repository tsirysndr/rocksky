import { atom, useAtom } from "jotai";
import { getCreds, star, unstar } from "./navidrome";

/** Set of liked track ids (Subsonic song id = tracks.xata_id). */
export const likedIdsAtom = atom<Set<string>>(new Set<string>());

/**
 * Returns a toggle(trackId) that optimistically flips the liked state and calls
 * the Navidrome star / unstar API, reverting on failure.
 */
export function useToggleLike(token?: string) {
  const [liked, setLiked] = useAtom(likedIdsAtom);

  return async function toggle(trackId?: string) {
    if (!trackId || !token) return;
    const wasLiked = liked.has(trackId);
    const optimistic = new Set(liked);
    if (wasLiked) optimistic.delete(trackId);
    else optimistic.add(trackId);
    setLiked(optimistic);

    try {
      const creds = await getCreds(token);
      if (!creds) throw new Error("no credentials");
      if (wasLiked) await unstar(creds, trackId);
      else await star(creds, trackId);
    } catch {
      setLiked((cur) => {
        const reverted = new Set(cur);
        if (wasLiked) reverted.add(trackId);
        else reverted.delete(trackId);
        return reverted;
      });
    }
  };
}
