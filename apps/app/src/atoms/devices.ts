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
};

export const devicesAtom = atom<Record<string, RemoteDevice>>({});
export const activeDeviceIdAtom = atom<string | null>(null);
export const remoteCommandsAtom = atom<RemoteCommands | null>(null);
