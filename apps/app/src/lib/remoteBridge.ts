import type { RemoteController } from "@rocksky/sdk/remote";
import axios from "axios";
import { getDefaultStore } from "jotai";
import { activeDeviceIdAtom, selectedSourceAtom } from "../atoms/devices";
import {
  nowPlayingAtom,
  playbackLockedUntilAtom,
  playerAtom,
} from "../atoms/nowplaying";
import { API_URL } from "../consts";
import { storage } from "../storage";

export type TransportAction = "play" | "pause" | "next" | "previous" | "seek";

type Source = "rockbox" | "spotify" | "local" | "cast" | null;

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

  send(action: TransportAction, positionMs?: number): boolean {
    // Read the selected source at dispatch time; React effects may still hold
    // the previous route immediately after restore or switching devices.
    const selected = store.get(selectedSourceAtom);
    const source =
      selected?.kind === "device"
        ? "rockbox"
        : (selected?.kind ?? store.get(playerAtom) ?? state.source);
    if (source === "local" || source === "cast") {
      if (!state.localHandler) return false;
      state.localHandler(action, positionMs);
      return true;
    }
    if (source === "spotify") {
      void sendSpotify(action, positionMs);
      return true;
    }
    const target =
      selected?.kind === "device" ? selected.id : store.get(activeDeviceIdAtom);
    // The protocol broadcasts commands without a target. A missing route
    // (startup, disconnect, sign-out) must never control every linked device.
    // Read the live ID rather than the route effect's potentially stale target.
    if (source !== "rockbox" || !target?.trim() || !state.controller)
      return false;
    const args =
      action === "seek"
        ? { position: Math.max(0, Math.round(positionMs ?? 0)) }
        : undefined;
    state.controller.command(action, target, args);
    return true;
  },

  // Media-session Play/Pause are absolute commands, even when polling has
  // stale state. Update the UI only if there was a concrete playback route.
  setPlaying(playing: boolean) {
    if (!this.send(playing ? "play" : "pause")) return false;
    const nowPlaying = store.get(nowPlayingAtom);
    store.set(playbackLockedUntilAtom, Date.now() + 1500);
    if (nowPlaying) {
      store.set(nowPlayingAtom, { ...nowPlaying, isPlaying: playing });
    }
    return true;
  },

  togglePlayPause() {
    const wasPlaying = this.isPlaying();
    return this.setPlaying(!wasPlaying) ? !wasPlaying : wasPlaying;
  },

  isPlaying() {
    return store.get(nowPlayingAtom)?.isPlaying ?? false;
  },
};
