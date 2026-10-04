// Type-only, from the package root where it is re-exported: erased at
// compile time, so no extra module is pulled into the bundle.
import type { RemoteAudioSettings } from "@rocksky/sdk";
import { atom } from "jotai";

export type DeviceTrack = {
  title: string;
  artist: string;
  album?: string;
  albumArtist?: string;
  albumArt?: string;
  duration: number;
  elapsed: number;
  isPlaying: boolean;
  shuffle?: boolean;
  repeat?: "off" | "one" | "all";
  volume?: number;
  songUri?: string;
  albumUri?: string;
  artistUri?: string;
  sha256?: string;
  liked?: boolean;
};

export type DeviceQueueTrack = {
  trackId?: string;
  uploadId?: string;
  title: string;
  artist: string;
  album?: string;
  albumArtist?: string;
  albumArt?: string;
  duration?: number;
  songUri?: string;
  albumUri?: string;
  trackNumber?: number;
};

export type RemoteDevice = {
  deviceId: string;
  name: string;
  nowPlaying: DeviceTrack | null;
  queue: DeviceQueueTrack[];
  queueIndex: number;
};

export type RemoteCommandAction =
  | "play"
  | "pause"
  | "next"
  | "previous"
  | "seek"
  | "queue_jump"
  | "queue_remove"
  | "queue_move"
  | "shuffle"
  | "repeat"
  | "volume";

export type RemoteCommands = {
  send: (
    action: RemoteCommandAction,
    args?: Record<string, unknown>,
    target?: string,
  ) => void;
  setPrimary: (deviceId: string) => void;
  /**
   * Push a partial DSP document to a device (protocol §6.1).
   *
   * Safe to send verbatim: a player applies the sections its engine implements
   * and ignores the rest, which is why there is nothing to negotiate first.
   */
  setAudioSettings: (deviceId: string, settings: RemoteAudioSettings) => void;
};

export const devicesAtom = atom<Record<string, RemoteDevice>>({});
export const activeDeviceIdAtom = atom<string | null>(null);
export const remoteCommandsAtom = atom<RemoteCommands | null>(null);

/**
 * The source the user picked in the switcher, and so the one that owns the
 * now-playing display.
 *
 * activeDeviceId can't say this: the ws re-seeds it with the server's primary,
 * and it has no way to mean "this phone" or "Spotify". Without it the in-app
 * engine and a remote device both wrote the same atoms, which flickered the
 * mini player, and switching to an idle device left the previous one's track on
 * screen. Null until the user chooses: whatever is playing is shown then.
 */
export type PlaybackSource =
  | { kind: "device"; id: string }
  | { kind: "local" }
  | { kind: "spotify" };

export const selectedSourceAtom = atom<PlaybackSource | null>(null);
