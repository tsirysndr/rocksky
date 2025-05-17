import { useNowPlaying } from "@/src/hooks/useNowPlaying";
import { createContext, useContext } from "react";

const did = "did:plc:7vdlgi2bflelz7mmuxoqjfcr";

export const NowPlayingContext = createContext<ReturnType<
  typeof useNowPlaying
> | null>(null);

export const NowPlayingProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const nowPlayingValue = useNowPlaying(did);
  return (
    <NowPlayingContext.Provider value={nowPlayingValue}>
      {children}
    </NowPlayingContext.Provider>
  );
};

export const useNowPlayingContext = () => {
  const ctx = useContext(NowPlayingContext);
  if (!ctx)
    throw new Error(
      "useNowPlayingContext must be used within NowPlayingProvider"
    );
  return ctx;
};
