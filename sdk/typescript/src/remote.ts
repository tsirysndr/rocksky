// Browser-safe entry: the remote-control player + controller only.
//
// The main entry (`@rocksky/sdk`) bundles the dedup index (classic-level) and
// the identity hashes (node:crypto), which are Node-only. The remote player /
// controller are pure WebSocket + JSON with zero Node dependencies, so this
// subpath (`@rocksky/sdk/remote`) is safe to import from a browser bundle.

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
