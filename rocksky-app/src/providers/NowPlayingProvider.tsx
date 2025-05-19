import { useNowPlaying } from "@/src/hooks/useNowPlaying";
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const did = "did:plc:7vdlgi2bflelz7mmuxoqjfcr";

// Create a more specific type for the context
export type NowPlayingContextType = ReturnType<typeof useNowPlaying>;

// Create a default value to avoid null checks
const defaultContextValue: NowPlayingContextType = {
  nowPlaying: null,
  progress: 0,
  isLoading: false,
};

export const NowPlayingContext =
  createContext<NowPlayingContextType>(defaultContextValue);

export const NowPlayingProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  // Get the now playing data
  const nowPlayingData = useNowPlaying(did);

  // Progress updates can be frequent but shouldn't cause full re-renders
  // We'll use a separate effect to handle progress
  const [progress, setProgress] = useState(0);

  // Store the latest full data reference to avoid object recreation
  const [stableContextValue, setStableContextValue] =
    useState<NowPlayingContextType>(defaultContextValue);

  // Track previous values to detect meaningful changes
  const prevNowPlayingRef = useRef(nowPlayingData.nowPlaying);
  const prevIsLoadingRef = useRef(nowPlayingData.isLoading);

  // Update context when significant changes happen (not for progress)
  useEffect(() => {
    // Check if important properties changed (not progress)
    const nowPlayingChanged =
      !!prevNowPlayingRef.current !== !!nowPlayingData.nowPlaying ||
      prevNowPlayingRef.current?.uri !== nowPlayingData.nowPlaying?.uri ||
      prevNowPlayingRef.current?.isPlaying !==
        nowPlayingData.nowPlaying?.isPlaying;

    const loadingChanged =
      prevIsLoadingRef.current !== nowPlayingData.isLoading;

    // Only update the whole context when important things change
    if (nowPlayingChanged || loadingChanged) {
      prevNowPlayingRef.current = nowPlayingData.nowPlaying;
      prevIsLoadingRef.current = nowPlayingData.isLoading;

      // Create a new context value but keep using our managed progress value
      setStableContextValue({
        ...nowPlayingData,
        progress: progress, // Use our separately tracked progress
      });
    }
  }, [
    nowPlayingData.nowPlaying?.uri,
    nowPlayingData.nowPlaying?.isPlaying,
    nowPlayingData.isLoading,
    !!nowPlayingData.nowPlaying,
  ]);

  // Separately track progress without triggering full context updates
  useEffect(() => {
    // Always update progress state (this won't cause child re-renders unless they use progress)
    setProgress(nowPlayingData.progress);
  }, [nowPlayingData.progress]);

  // Create the final context value that includes latest progress but stable other values
  const contextValue = useMemo(() => {
    return {
      ...stableContextValue,
      progress: progress,
    };
  }, [stableContextValue, progress]);

  return (
    <NowPlayingContext.Provider value={contextValue}>
      {children}
    </NowPlayingContext.Provider>
  );
};

// For components that only need progress, we can create a specialized hook
export const useNowPlayingProgress = () => {
  const context = useContext(NowPlayingContext);
  return context.progress;
};

// Custom hook to use the full context
export const useNowPlayingContext = () => {
  return useContext(NowPlayingContext);
};

// Additional hook for components that need playing status but not progress
export const useNowPlayingStatus = () => {
  const context = useContext(NowPlayingContext);
  return {
    nowPlaying: context.nowPlaying,
    isLoading: context.isLoading,
  };
};
