import { useCallback, useEffect, useState } from "react";
import { idleState, type ReceiverState } from "./receiver";
import { observeReceiver, type Player } from "./receiverUpdates";
interface ReceiverContext {
  getPlayerManager(): Player;
  start(options?: {
    disableIdleTimeout?: boolean;
    mediaElement?: HTMLMediaElement;
  }): void;
}
declare global {
  interface Window {
    cast?: {
      framework: {
        CastReceiverContext: { getInstance(): ReceiverContext };
        events: { EventType: Record<string, string> };
      };
    };
  }
}
let contextStarted = false;
let activePlayer: Player | null = null;
export function useReceiver() {
  const [state, setState] = useState<ReceiverState>(idleState);
  useEffect(() => {
    if (!window.cast?.framework) {
      setState({
        ...idleState,
        phase: "error",
        error:
          "The Cast receiver could not start. Check the connection and cast again.",
      });
      return;
    }
    let cleanup = () => {};
    try {
      const framework = window.cast.framework;
      const context = framework.CastReceiverContext.getInstance();
      const player = context.getPlayerManager();
      activePlayer = player;
      const mediaElement =
        document.querySelector<HTMLAudioElement>("#receiver-audio") ??
        undefined;
      if (!contextStarted) {
        context.start({ disableIdleTimeout: false, mediaElement });
        contextStarted = true;
      }
      const observer = observeReceiver(
        player,
        framework.events.EventType,
        setState,
        mediaElement,
      );
      // Backup for receivers that emit sparse TIME_UPDATE events. This reads only
      // the real media clock, never extrapolates while buffering, and skips duplicates.
      const timer = window.setInterval(observer.progress, 1000);
      cleanup = () => {
        clearInterval(timer);
        observer.dispose();
        if (activePlayer === player) activePlayer = null;
      };
    } catch {
      setState({
        ...idleState,
        phase: "error",
        error: "Open Rocksky on your phone and connect to this Chromecast.",
      });
    }
    return cleanup;
  }, []);
  const toggle = useCallback(() => {
    if (activePlayer?.getPlayerState() === "PLAYING") activePlayer.pause();
    else activePlayer?.play();
  }, []);
  const seek = useCallback(
    (position: number) => activePlayer?.seek(position),
    [],
  );
  return { state, toggle, seek };
}
