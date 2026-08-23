// Lightweight entry: the remote-control player + controller only.
//
// Since 0.14.0 the main entry (`@rocksky/sdk`) is browser-safe too — the
// dedup index (classic-level, Node-only) moved to `@rocksky/sdk/dedup`. This
// subpath remains for consumers that only need the remote player/controller.

export {
  RemotePlayer,
  DEFAULT_REMOTE_WS,
  type RemotePlayerOptions,
  type RemotePlayerHandlers,
  type RemoteNowPlaying,
  type RemoteQueueItem,
  type EnqueueCommand,
} from "./remote-player.js";
export {
  RemoteController,
  type RemoteControllerOptions,
  type RemoteControllerEvents,
  type RemoteDevice,
  type RemoteStatus,
} from "./remote-controller.js";
