import { useEffect, useState } from "react";
import { idleState, snapshot, type ReceiverState } from "./receiver";
interface Player {
  getMediaInformation(): unknown;
  getCurrentTimeSec(): number;
  getDurationSec(): number;
  getPlayerState(): string;
  getQueueManager():
    | { getItems(): unknown[]; getCurrentItemIndex(): number }
    | undefined;
  addEventListener(type: string, callback: (event: unknown) => void): void;
  removeEventListener(type: string, callback: (event: unknown) => void): void;
  play(): void;
  pause(): void;
  seek(position: number): void;
}
interface ReceiverContext {
  getPlayerManager(): Player;
  start(options?: { disableIdleTimeout?: boolean }): void;
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
      let playbackError: string | undefined;
      const update = () => {
        const queue = player.getQueueManager();
        const next = snapshot({
          playerState: player.getPlayerState(),
          media: player.getMediaInformation(),
          position: player.getCurrentTimeSec(),
          duration: player.getDurationSec(),
          items: queue?.getItems() ?? [],
          index: queue?.getCurrentItemIndex() ?? -1,
        });
        if (next.phase === "playing" || next.phase === "loading")
          playbackError = undefined;
        setState(
          playbackError
            ? { ...next, phase: "error", error: playbackError }
            : next,
        );
      };
      const onError = () => {
        playbackError =
          "This track could not be played. Check your Wi-Fi connection or try another audio format.";
        update();
      };
      const errorEvent = framework.events.EventType.ERROR;
      player.addEventListener(errorEvent, onError);
      if (!contextStarted) {
        context.start({ disableIdleTimeout: false });
        contextStarted = true;
      }
      const timer = window.setInterval(update, 500);
      update();
      cleanup = () => {
        clearInterval(timer);
        player.removeEventListener(errorEvent, onError);
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
  const toggle = () => {
    if (state.phase === "playing") activePlayer?.pause();
    else activePlayer?.play();
  };
  const seek = (position: number) => activePlayer?.seek(position);
  return { state, toggle, seek };
}
