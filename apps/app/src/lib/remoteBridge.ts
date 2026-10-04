import type { RemoteController } from "@rocksky/sdk/remote";
import axios from "axios";
import { getDefaultStore } from "jotai";
import { nowPlayingAtom, playbackLockedUntilAtom } from "../atoms/nowplaying";
import { API_URL } from "../consts";
import { storage } from "../storage";

export type TransportAction = "play" | "pause" | "next" | "previous" | "seek";

type Source = "rockbox" | "spotify" | "local" | null;

type LocalTransportHandler = (
  action: TransportAction,
  positionMs?: number,
) => void;

// Module-level transport routing, shared by the React hooks AND the headless
// media-notification service (which runs outside the component tree).
const state = {
  controller: null as RemoteController | null,
  target: null as string | null,
  source: null as Source,
  localHandler: null as LocalTransportHandler | null,
};

const store = getDefaultStore();

const authHeaders = () => ({
  headers: { Authorization: `Bearer ${storage.getToken()}` },
});

async function sendSpotify(action: TransportAction, positionMs?: number) {
  try {
    switch (action) {
      case "play":
      case "pause":
        await axios.put(`${API_URL}/spotify/${action}`, {}, authHeaders());
        break;
      case "next":
      case "previous":
        await axios.post(`${API_URL}/spotify/${action}`, {}, authHeaders());
        break;
      case "seek":
        await axios.put(
          `${API_URL}/spotify/seek?position_ms=${Math.max(0, Math.round(positionMs ?? 0))}`,
          {},
          authHeaders(),
        );
        break;
    }
  } catch {}
}

export const remoteBridge = {
  setController(controller: RemoteController | null) {
    state.controller = controller;
  },

  setRoute(source: Source, target: string | null) {
    state.source = source;
    state.target = target;
  },

  // The in-app native engine (uploaded-track playback) registers here; while
  // it is the active source every transport action goes straight to it.
  setLocalHandler(handler: LocalTransportHandler | null) {
    state.localHandler = handler;
  },

  send(action: TransportAction, positionMs?: number) {
    if (state.source === "local") {
      state.localHandler?.(action, positionMs);
      return;
    }
    if (state.source === "spotify") {
      void sendSpotify(action, positionMs);
      return;
    }
    const target = state.target ?? undefined;
    const args =
      action === "seek"
        ? { position: Math.max(0, Math.round(positionMs ?? 0)) }
        : undefined;
    state.controller?.command(action, target, args);
  },

  // Optimistic play/pause used by the notification buttons: flips the shared
  // now-playing state immediately and locks out polling echoes for 1.5s.
  togglePlayPause() {
    const nowPlaying = store.get(nowPlayingAtom);
    const wasPlaying = nowPlaying?.isPlaying ?? false;
    store.set(playbackLockedUntilAtom, Date.now() + 1500);
    if (nowPlaying) {
      store.set(nowPlayingAtom, { ...nowPlaying, isPlaying: !wasPlaying });
    }
    this.send(wasPlaying ? "pause" : "play");
    return !wasPlaying;
  },

  isPlaying() {
    return store.get(nowPlayingAtom)?.isPlaying ?? false;
  },
};
