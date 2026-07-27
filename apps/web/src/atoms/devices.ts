import { atom } from "jotai";
import type { QueueTrack } from "./queue";

// One connected remote player's now-playing (same shape the miniplayer reads).
export type RemoteNowPlaying = {
  title: string;
  artist: string;
  artistUri: string;
  songUri: string;
  albumUri: string;
  duration: number;
  progress: number;
  albumArt?: string;
  isPlaying: boolean;
  liked: boolean;
  sha256: string;
};

export type RemoteDevice = {
  deviceId: string;
  name: string;
  nowPlaying: RemoteNowPlaying | null;
  // The device's real playback queue + current index, mirrored from its `queue`
  // pushes so the miniplayer's queue panel stays in sync.
  queue: QueueTrack[];
  queueIndex: number;
};

// Every connected player device, keyed by device_id — the source of truth for
// the device picker. A user can have several players streaming at once; each
// gets its own entry, so their states never conflict.
export const devicesAtom = atom<Record<string, RemoteDevice>>({});

// The device the miniplayer currently shows/controls. It is also the user's
// "primary" (the profile/scrobble source), kept in sync across all the user's
// clients via the server's `primary_changed` broadcast.
export const activeDeviceIdAtom = atom<string | null>(null);

// A bridge so anything in the app (e.g. library context menus) can send a
// command to the active remote device without owning the WebSocket. StickyPlayer
// publishes it; `active` is true when a remote device is the current player.
export type DeviceCommand = {
  active: boolean;
  send: (action: string, args?: unknown) => void;
};

export const deviceCommandAtom = atom<DeviceCommand>({
  active: false,
  send: () => {},
});
