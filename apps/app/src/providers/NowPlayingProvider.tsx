import { useNowPlaying } from "@/src/hooks/useNowPlaying";
import { storage } from "@/src/storage";
import { createContext, useContext, useMemo, type ReactNode } from "react";

const NowPlayingContext = createContext<
  ReturnType<typeof useNowPlaying>["nowPlaying"] | null
>(null);
const ProgressContext =
  createContext<ReturnType<typeof useNowPlaying>["progress"]>(0);

export const NowPlayingProvider = ({ children }: { children: ReactNode }) => {
  const did = storage.getDid() || "";
  const { nowPlaying, progress } = useNowPlaying(did);

  const memoizedNowPlaying = useMemo(
    () => nowPlaying,
    [nowPlaying?.uri, nowPlaying?.isPlaying, nowPlaying?.liked],
  );

  return (
    <NowPlayingContext.Provider value={memoizedNowPlaying}>
      <ProgressContext.Provider value={progress}>
        {children}
      </ProgressContext.Provider>
    </NowPlayingContext.Provider>
  );
};

export const useNowPlayingContext = () => {
  const ctx = useContext(NowPlayingContext);
  return ctx;
};

export const useProgressContext = () => {
  return useContext(ProgressContext);
};
