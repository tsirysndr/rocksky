// Rocksky remote: makes the CLI player a controllable WebSocket device on the
// Rocksky relay (GET /ws), exactly like the Rust `connect` daemon and the
// browser miniplayers. It
//   • registers as "Rocksky CLI" using the cached access token,
//   • pushes now-playing (track) + transport (status) from `playerController`,
//   • executes play/pause/next/previous/seek commands sent from the web/mobile
//     miniplayers.
// The relay scopes everything by the token's DID and broadcasts our state to
// the user's other devices, so the CLI and the miniplayers stay in sync.
//
// Deliberately silent on stdout: the TUI renders with Ink, so any console
// output would corrupt the screen. Set ROCKSKY_WS_DEBUG=1 for stderr tracing.

import { ROCKSKY_API_URL } from "client";
import { skipNext, skipPrev } from "./playback";
import { playerController } from "./player";
import { loadSettings } from "./settings";

const WS_URL =
  process.env.ROCKSKY_WS ||
  `${ROCKSKY_API_URL.replace(/^http/, "ws")}/ws`;

// Poll cadence for pushing state, and how often we re-push the current track so
// remote elapsed can't drift far from ours (the miniplayers tick progress
// locally between our pushes and reconcile on each one).
const PUSH_INTERVAL_MS = 1000;
const TRACK_REPUSH_MS = 4000;
const HEARTBEAT_MS = 10_000;
const RECONNECT_MS = 3000;

function debug(...args: unknown[]) {
  if (process.env.ROCKSKY_WS_DEBUG) console.error("[rocksky-ws]", ...args);
}

// PlayerStatus.state → the numeric status the relay/miniplayers expect.
function statusCode(state: "stopped" | "playing" | "paused"): number {
  return state === "playing" ? 1 : state === "paused" ? 2 : 0;
}

export interface RockskyRemote {
  stop(): void;
}

/**
 * Connect the shared `playerController` to the Rocksky relay. `getToken` is read
 * on every connect/send so a login mid-session takes effect and a logout stops
 * traffic. Returns a handle whose `stop()` tears the connection down.
 */
export function startRockskyRemote(
  getToken: () => string | undefined,
): RockskyRemote {
  if (process.env.ROCKSKY_NO_REMOTE) {
    return { stop() {} };
  }

  let ws: WebSocket | null = null;
  let deviceId = "";
  let clientName = "Rocksky CLI";
  let stopped = false;
  let pushTimer: ReturnType<typeof setInterval> | undefined;
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

  // Last state we broadcast, so we only push on change (plus the re-push timer).
  let lastStatusCode = -1;
  let lastTrackKey = "";
  let lastTrackPushAt = 0;

  const send = (payload: unknown) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(payload));
      } catch (e) {
        debug("send error", e);
      }
    }
  };

  // Build and push the current now-playing track message. `force` bypasses the
  // change/interval gates (used right after a command so clients update fast).
  const pushTrack = (force = false) => {
    const token = getToken();
    if (!token || !deviceId) return;
    const status = playerController.status();
    const item = playerController.currentItem();
    if (!status || !item || status.state === "stopped") return;

    const durationMs = status.duration_ms || item.duration || 0;
    const elapsedMs = status.position_ms || 0;
    const key = `${item.title}|${item.artist}|${item.album ?? ""}|${status.index}`;
    const now = Date.now();
    if (!force && key === lastTrackKey && now - lastTrackPushAt < TRACK_REPUSH_MS)
      return;
    lastTrackKey = key;
    lastTrackPushAt = now;

    send({
      type: "message",
      device_id: deviceId,
      token,
      data: {
        type: "track",
        title: item.title,
        artist: item.artist,
        album: item.album,
        album_artist: item.albumArtist || item.artist,
        length: durationMs,
        elapsed: elapsedMs,
        duration_ms: durationMs,
        album_art: item.albumArt,
        // Play-state travels with the track so clients know it's playing even
        // if they adopted the device after the initial `status` message.
        is_playing: status.state === "playing",
        // Carry the device name inside `data` too: the relay passes `data`
        // through untouched, so clients can label the source even on an API
        // build that doesn't add the top-level `device_name` field.
        device_name: clientName,
      },
    });
  };

  const pushStatus = (code: number) => {
    const token = getToken();
    if (!token || !deviceId) return;
    send({
      type: "message",
      device_id: deviceId,
      token,
      data: { type: "status", status: code },
    });
  };

  // One tick: emit status transitions immediately, and the current track on
  // change or every TRACK_REPUSH_MS while playing.
  const tick = () => {
    const status = playerController.status();
    const code = statusCode(status?.state ?? "stopped");
    if (code !== lastStatusCode) {
      lastStatusCode = code;
      pushStatus(code);
      if (code === 0) lastTrackKey = ""; // force a fresh track push on resume
    }
    if (code !== 0) pushTrack();
  };

  const handleCommand = async (msg: {
    action?: string;
    args?: unknown;
    position?: number;
  }) => {
    const token = getToken();
    switch (msg.action) {
      case "play":
        playerController.play();
        break;
      case "pause":
        playerController.pause();
        break;
      case "next":
        if (token) await skipNext(token);
        else playerController.next();
        break;
      case "previous":
        if (token) await skipPrev(token);
        else playerController.previous();
        break;
      case "seek": {
        // The relay forwards only {type, action, args}, so a seek position must
        // ride in `args` (a number, or { position }). `position` is accepted too
        // for clients that send it top-level.
        const a = msg.args as { position?: number } | number | undefined;
        const pos =
          typeof a === "number"
            ? a
            : (a?.position ?? msg.position ?? 0);
        playerController.seekMs(pos);
        break;
      }
      default:
        debug("unknown command", msg.action);
        return;
    }
    // Reflect the new state to every device without waiting for the next tick.
    lastStatusCode = -1;
    setTimeout(() => {
      tick();
      pushTrack(true);
    }, 50);
  };

  const connect = () => {
    if (stopped) return;
    const token = getToken();
    if (!token) {
      // Not logged in yet — retry shortly so a later `rocksky login` connects.
      reconnectTimer = setTimeout(connect, RECONNECT_MS);
      return;
    }

    debug("connecting to", WS_URL);
    let socket: WebSocket;
    try {
      socket = new WebSocket(WS_URL);
    } catch (e) {
      debug("connect failed", e);
      reconnectTimer = setTimeout(connect, RECONNECT_MS);
      return;
    }
    ws = socket;

    socket.onopen = () => {
      debug("connected");
      // The advertised name is configurable via ~/.rocksky/settings.toml
      // ([remote] name = "…"); read fresh on each connect so edits take effect.
      clientName = loadSettings().remote.name;
      send({ type: "register", clientName, token: getToken() });
      heartbeatTimer = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) socket.send("ping");
      }, HEARTBEAT_MS);
    };

    socket.onmessage = (event) => {
      let msg: Record<string, unknown>;
      try {
        if (event.data === "pong") return;
        msg = JSON.parse(event.data as string);
      } catch {
        return;
      }
      // Our device id comes ONLY from the registration reply, which the server
      // marks with `status: "registered"`. Crucially, do NOT read `deviceId`
      // from any message: the server also broadcasts `device_registered` events
      // (carrying ANOTHER device's id) whenever a new device — e.g. the web
      // miniplayer "rocksky-web" — joins. Capturing that would clobber our own
      // id, so our track pushes would be tagged with the other device's id and
      // every miniplayer would mislabel the source as that device.
      if (msg.status === "registered" && typeof msg.deviceId === "string") {
        deviceId = msg.deviceId;
        debug("registered", deviceId);
        // Start pushing state now that we have an id.
        lastStatusCode = -1;
        lastTrackKey = "";
        tick();
        pushTrack(true);
        if (!pushTimer) pushTimer = setInterval(tick, PUSH_INTERVAL_MS);
        return;
      }
      // Ignore `device_registered` announcements about other devices.
      if (msg.type === "device_registered") return;
      if (msg.type === "command") {
        void handleCommand(msg as { action?: string; args?: unknown });
      }
      // `type: "message"` broadcasts (our own state echoed back, or another
      // device's) are ignored — the CLI is the player, not a controller.
    };

    socket.onerror = (e) => debug("socket error", e);

    socket.onclose = () => {
      debug("disconnected");
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (pushTimer) clearInterval(pushTimer);
      heartbeatTimer = undefined;
      pushTimer = undefined;
      ws = null;
      deviceId = "";
      if (!stopped) reconnectTimer = setTimeout(connect, RECONNECT_MS);
    };
  };

  connect();

  return {
    stop() {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (pushTimer) clearInterval(pushTimer);
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
      ws = null;
    },
  };
}
