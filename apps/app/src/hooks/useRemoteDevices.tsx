import { useAtom, useSetAtom } from "jotai";
import { useEffect, useRef } from "react";
import {
  activeDeviceIdAtom,
  type DeviceQueueTrack,
  type DeviceTrack,
  devicesAtom,
  type RemoteCommandAction,
  type RemoteDevice,
  remoteCommandsAtom,
} from "../atoms/devices";
import { API_URL } from "../consts";
import { storage } from "../storage";

const WS_URL = `${API_URL.replace("https", "wss").replace("http", "ws")}/ws`;
const HEARTBEAT_MS = 10_000;
const RECONNECT_MS = 3_000;

type RawTrack = Record<string, unknown>;

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function parseRepeat(v: unknown): "off" | "one" | "all" | undefined {
  return v === "off" || v === "one" || v === "all" ? v : undefined;
}

function parseTrack(raw: RawTrack | null | undefined): DeviceTrack | null {
  if (!raw || !str(raw.title)) return null;
  return {
    title: str(raw.title) ?? "",
    artist: str(raw.album_artist) ?? str(raw.artist) ?? "",
    album: str(raw.album),
    albumArtist: str(raw.album_artist),
    albumArt: str(raw.album_art),
    duration: num(raw.duration_ms) || num(raw.length) || num(raw.duration),
    elapsed: num(raw.elapsed) || num(raw.progress_ms),
    isPlaying: raw.is_playing === true,
    shuffle: typeof raw.shuffle === "boolean" ? raw.shuffle : undefined,
    repeat: parseRepeat(raw.repeat),
    volume: typeof raw.volume === "number" ? raw.volume : undefined,
    songUri: str(raw.song_uri) ?? str(raw.songUri),
    albumUri: str(raw.album_uri) ?? str(raw.albumUri),
    artistUri: str(raw.artist_uri) ?? str(raw.artistUri),
    sha256: str(raw.sha256),
    liked: typeof raw.liked === "boolean" ? raw.liked : undefined,
  };
}

function parseQueue(raw: unknown): DeviceQueueTrack[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((t): t is RawTrack => !!t && typeof t === "object")
    .map((t) => ({
      trackId: str(t.trackId) ?? str(t.track_id),
      uploadId: str(t.uploadId) ?? str(t.upload_id),
      title: str(t.title) ?? "",
      artist: str(t.artist) ?? "",
      album: str(t.album),
      albumArtist: str(t.album_artist),
      albumArt: str(t.album_art) ?? str(t.albumArt),
      duration: num(t.duration) || undefined,
      songUri: str(t.song_uri) ?? str(t.songUri),
      albumUri: str(t.album_uri) ?? str(t.albumUri),
      trackNumber:
        typeof t.track_number === "number" ? t.track_number : undefined,
    }));
}

// Owns the remote-control WebSocket (wss://api.rocksky.app/ws): keeps the
// device registry up to date and publishes the command senders. Mount once.
export function useRemoteDevicesConnection() {
  const setDevices = useSetAtom(devicesAtom);
  const [, setActiveDeviceId] = useAtom(activeDeviceIdAtom);
  const setCommands = useSetAtom(remoteCommandsAtom);
  const wsRef = useRef<WebSocket | null>(null);
  const stoppedRef = useRef(false);

  useEffect(() => {
    const token = storage.getToken();
    if (!token) return;
    stoppedRef.current = false;
    let heartbeat: ReturnType<typeof setInterval> | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (stoppedRef.current) return;
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            type: "register",
            clientName: "rocksky-mobile",
            token,
          }),
        );
        heartbeat = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send("ping");
        }, HEARTBEAT_MS);
      };

      ws.onmessage = (event) => {
        if (event.data === "pong") return;
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(event.data as string);
        } catch {
          return;
        }

        switch (msg.type) {
          case "devices": {
            const list = Array.isArray(msg.devices) ? msg.devices : [];
            const next: Record<string, RemoteDevice> = {};
            for (const d of list as RawTrack[]) {
              const dev = buildDevice(d);
              if (dev) next[dev.deviceId] = dev;
            }
            setDevices(next);
            const primary = str(msg.primary_device);
            setActiveDeviceId((prev) =>
              prev && next[prev]
                ? prev
                : (primary ?? Object.keys(next)[0] ?? null),
            );
            break;
          }
          case "device_registered": {
            const id = str(msg.deviceId) ?? str(msg.device_id);
            if (!id) break;
            const name = str(msg.clientName) ?? str(msg.device_name) ?? id;
            setDevices((prev) =>
              prev[id]
                ? prev
                : {
                    ...prev,
                    [id]: {
                      deviceId: id,
                      name,
                      nowPlaying: null,
                      queue: [],
                      queueIndex: 0,
                    },
                  },
            );
            break;
          }
          case "device_unregistered": {
            const id = str(msg.device_id) ?? str(msg.deviceId);
            if (!id) break;
            setDevices((prev) => {
              if (!prev[id]) return prev;
              const next = { ...prev };
              delete next[id];
              return next;
            });
            setActiveDeviceId((prev) => (prev === id ? null : prev));
            break;
          }
          case "primary_changed": {
            const id = str(msg.device_id) ?? str(msg.deviceId);
            if (id) setActiveDeviceId(id);
            break;
          }
          case "message": {
            const id = str(msg.device_id);
            const data = msg.data as RawTrack | undefined;
            if (!id || !data) break;
            const name = str(msg.device_name) ?? id;
            setDevices((prev) => {
              const existing = prev[id] ?? {
                deviceId: id,
                name,
                nowPlaying: null,
                queue: [],
                queueIndex: 0,
              };
              if (data.type === "track") {
                const track = parseTrack(data);
                return {
                  ...prev,
                  [id]: { ...existing, name, nowPlaying: track },
                };
              }
              if (data.type === "status") {
                const status = num(data.status);
                if (status === 0) {
                  return { ...prev, [id]: { ...existing, nowPlaying: null } };
                }
                if (!existing.nowPlaying) return prev;
                return {
                  ...prev,
                  [id]: {
                    ...existing,
                    nowPlaying: {
                      ...existing.nowPlaying,
                      isPlaying: status === 1,
                    },
                  },
                };
              }
              if (data.type === "queue") {
                return {
                  ...prev,
                  [id]: {
                    ...existing,
                    queue: parseQueue(data.queue),
                    queueIndex: num(data.index),
                  },
                };
              }
              return prev;
            });
            break;
          }
        }
      };

      ws.onerror = () => {};
      ws.onclose = () => {
        if (heartbeat) {
          clearInterval(heartbeat);
          heartbeat = null;
        }
        if (!stoppedRef.current) {
          reconnectTimer = setTimeout(connect, RECONNECT_MS);
        }
      };
    };

    const buildDevice = (d: RawTrack) => {
      const id = str(d.device_id) ?? str(d.deviceId);
      if (!id) return null;
      const queueObj = (d.queue ?? {}) as RawTrack;
      return {
        deviceId: id,
        name: str(d.name) ?? id,
        nowPlaying: parseTrack(d.now_playing as RawTrack | undefined),
        queue: parseQueue(queueObj.queue),
        queueIndex: num(queueObj.index),
      };
    };

    connect();

    setCommands({
      send: (
        action: RemoteCommandAction,
        args?: Record<string, unknown>,
        target?: string,
      ) => {
        const ws = wsRef.current;
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: "command",
              action,
              token,
              ...(target ? { target } : {}),
              ...(args ? { args } : {}),
            }),
          );
        }
      },
      setPrimary: (deviceId: string) => {
        const ws = wsRef.current;
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({ type: "set_primary", device_id: deviceId, token }),
          );
        }
        setActiveDeviceId(deviceId);
      },
    });

    return () => {
      stoppedRef.current = true;
      if (heartbeat) clearInterval(heartbeat);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      wsRef.current?.close();
      setCommands(null);
    };
  }, [setDevices, setActiveDeviceId, setCommands]);
}
