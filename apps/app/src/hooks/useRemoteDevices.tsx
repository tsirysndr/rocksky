import {
  RemoteController,
  type RemoteNowPlaying,
  type RemoteQueueItem,
  type RemoteDevice as SdkRemoteDevice,
} from "@rocksky/sdk/remote";
import { getDefaultStore, useAtom, useAtomValue, useSetAtom } from "jotai";
import { useEffect } from "react";
import { authTokenAtom } from "../atoms/auth";
import {
  activeDeviceIdAtom,
  selectedSourceAtom,
  type DeviceQueueTrack,
  type DeviceTrack,
  devicesAtom,
  type RemoteDevice,
  remoteCommandsAtom,
} from "../atoms/devices";
import { API_URL } from "../consts";
import { remoteBridge } from "../lib/remoteBridge";
import { storage } from "../storage";

const WS_URL = `${API_URL.replace("https", "wss").replace("http", "ws")}/ws`;

function toDeviceTrack(track: RemoteNowPlaying): DeviceTrack | null {
  if (!track.title && !track.artist && !track.albumArtist) return null;
  return {
    title: track.title,
    artist: track.albumArtist || track.artist,
    album: track.album,
    albumArtist: track.albumArtist,
    albumArt: track.albumArt,
    duration: track.durationMs ?? 0,
    elapsed: track.elapsedMs ?? 0,
    isPlaying: track.isPlaying === true,
    shuffle: track.shuffle,
    repeat: track.repeat,
    volume: track.volume,
    songUri: track.songUri,
    albumUri: track.albumUri,
    artistUri: track.artistUri,
    sha256: track.sha256,
    liked: track.liked,
  };
}

function toQueue(queue: RemoteQueueItem[] | undefined): DeviceQueueTrack[] {
  if (!Array.isArray(queue)) return [];
  return queue.map((item) => ({
    trackId: item.trackId,
    uploadId: item.uploadId,
    title: item.title,
    artist: item.artist,
    album: item.album,
    albumArtist: item.albumArtist,
    albumArt: item.albumArt,
    duration: item.durationMs,
    songUri: item.songUri,
    albumUri: item.albumUri,
    trackNumber: item.trackNumber,
  }));
}

function toDevice(device: SdkRemoteDevice): RemoteDevice {
  return {
    deviceId: device.deviceId,
    name: device.name || "Remote device",
    nowPlaying: device.nowPlaying ? toDeviceTrack(device.nowPlaying) : null,
    queue: toQueue(device.queue),
    queueIndex: device.queueIndex ?? 0,
  };
}

// Owns the remote-control connection (@rocksky/sdk RemoteController): keeps
// the device registry up to date and publishes the command senders. Mount once.
export function useRemoteDevicesConnection() {
  const setDevices = useSetAtom(devicesAtom);
  const [, setActiveDeviceId] = useAtom(activeDeviceIdAtom);
  const setCommands = useSetAtom(remoteCommandsAtom);
  const token = useAtomValue(authTokenAtom);

  useEffect(() => {
    if (!token) return;

    const controller = new RemoteController({
      url: WS_URL,
      token: () => storage.getToken() ?? undefined,
      name: "rocksky-mobile",
    });

    // Registration announcements include controller-only clients (for example
    // playerd-mcp and rockbox-web). Like web, discover players only from the
    // server's player snapshot and playback/queue events, never registration.
    controller
      .on("devices", ({ primaryDevice, devices }) => {
        const next: Record<string, RemoteDevice> = {};
        for (const d of devices) {
          if (!d.deviceId) continue;
          next[d.deviceId] = toDevice(d);
        }
        setDevices(next);
        setActiveDeviceId((prev) =>
          prev && next[prev]
            ? prev
            : primaryDevice && next[primaryDevice]
              ? primaryDevice
              : (Object.keys(next)[0] ?? null),
        );
      })
      .on("deviceUnregistered", ({ deviceId }) => {
        if (!deviceId) return;
        setDevices((prev) => {
          if (!prev[deviceId]) return prev;
          const next = { ...prev };
          delete next[deviceId];
          return next;
        });
        setActiveDeviceId((prev) => (prev === deviceId ? null : prev));
      })
      .on("primaryChanged", ({ deviceId }) => {
        if (deviceId) setActiveDeviceId(deviceId);
      })
      .on("nowPlaying", ({ deviceId, deviceName, track }) => {
        if (!deviceId) return;
        const parsed = toDeviceTrack(track);
        if (!parsed) return;
        setDevices((prev) => {
          const existing = prev[deviceId];
          return {
            ...prev,
            [deviceId]: {
              deviceId,
              name: deviceName || existing?.name || "Remote device",
              nowPlaying: parsed,
              queue: existing?.queue ?? [],
              queueIndex: existing?.queueIndex ?? 0,
            },
          };
        });
      })
      .on("status", ({ deviceId, status }) => {
        if (!deviceId) return;
        // "stopped" flashes between rockbox tracks — never drop the track on
        // it (that flickers the device rows), just mark it not playing.
        setDevices((prev) => {
          const existing = prev[deviceId];
          if (!existing?.nowPlaying) return prev;
          return {
            ...prev,
            [deviceId]: {
              ...existing,
              nowPlaying: {
                ...existing.nowPlaying,
                isPlaying: status === "playing",
              },
            },
          };
        });
      })
      .on("queue", ({ deviceId, deviceName, index, queue }) => {
        if (!deviceId) return;
        setDevices((prev) => {
          const existing = prev[deviceId] ?? {
            deviceId,
            name: deviceName || "Remote device",
            nowPlaying: null,
            queue: [],
            queueIndex: 0,
          };
          return {
            ...prev,
            [deviceId]: {
              ...existing,
              queue: toQueue(queue),
              queueIndex: index ?? 0,
            },
          };
        });
      });

    controller.connect();
    remoteBridge.setController(controller);

    setCommands({
      send: (action, args, target) => {
        const selected = getDefaultStore().get(selectedSourceAtom);
        const destination =
          target ??
          (selected?.kind === "device"
            ? selected.id
            : selected
              ? null
              : getDefaultStore().get(activeDeviceIdAtom));
        if (!destination?.trim()) return;
        controller.command(action, destination, args);
      },
      setPrimary: (deviceId) => {
        controller.setPrimary(deviceId);
        setActiveDeviceId(deviceId);
      },
      setAudioSettings: (deviceId, settings) => {
        controller.setAudioSettings(deviceId, settings);
      },
    });

    return () => {
      setCommands(null);
      remoteBridge.setController(null);
      controller.disconnect();
    };
  }, [token, setDevices, setActiveDeviceId, setCommands]);
}
