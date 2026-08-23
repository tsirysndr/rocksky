// Bridge to the native OS media session (src-tauri/src/media.rs): macOS Now
// Playing / media keys, Linux MPRIS.
//
// The webview deliberately has no Media Session and no <audio> element of its
// own — a media element in the page registers a SECOND Now Playing session, so
// the OS lists Rocksky twice. This is the only path from the UI to the OS
// controls, and it carries whatever the miniplayer is showing (local engine,
// remote device or Spotify), so the two can never drift apart.
import { invoke } from "@tauri-apps/api/core";
import { type UnlistenFn, listen } from "@tauri-apps/api/event";
import { isTauri } from "./tauri";

/** The miniplayer's state, in the shape `media.rs` deserializes. */
export type NativeNowPlaying = {
  title: string;
  artist: string;
  album: string;
  albumArt: string | null;
  /** Track length in milliseconds. */
  duration: number;
  /** Elapsed time in milliseconds. */
  position: number;
  isPlaying: boolean;
};

export type MediaControlAction =
  | "play"
  | "pause"
  | "toggle"
  | "next"
  | "previous"
  | "stop"
  | "seek"
  | "seekBy";

/** A transport action from the OS controls. */
export type MediaControl = {
  action: MediaControlAction;
  /** Absolute target for `seek`, signed delta for `seekBy` — milliseconds. */
  position: number | null;
};

/** Publish the miniplayer's state to the OS controls; `null` clears them. */
export function pushNowPlaying(state: NativeNowPlaying | null): void {
  if (!isTauri()) return;
  invoke<null>("media_set_now_playing", { state }).catch(() => {
    // No OS media session on this platform — the controls just don't show.
  });
}

/** Subscribe to transport actions from the OS controls. Returns an unsubscribe. */
export function onMediaControl(
  handler: (control: MediaControl) => void,
): () => void {
  if (!isTauri()) return () => {};
  let unlisten: UnlistenFn | null = null;
  let cancelled = false;
  listen<MediaControl>("media-control", (event) => handler(event.payload))
    .then((un) => {
      // Unmounted before the listener registered — drop it immediately.
      if (cancelled) un();
      else unlisten = un;
    })
    .catch(() => {});
  return () => {
    cancelled = true;
    unlisten?.();
  };
}
