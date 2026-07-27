import { atom } from "jotai";

/**
 * Imperative transport controls published by the mounted sticky player so
 * app-wide keyboard shortcuts (see components/KeyboardShortcuts) can drive
 * playback without reaching into the player component tree.
 *
 * Null when nothing is playing — media shortcuts stay inert (and never
 * preventDefault) on pages with no active track.
 */
export type PlayerControls = {
  /** Toggle play / pause for the current track. */
  toggle: () => void;
  /** Skip to the next track in the queue. */
  next: () => void;
  /** Skip to the previous track in the queue. */
  previous: () => void;
  /** Toggle mute. */
  toggleMute: () => void;
  /** Seek by a signed delta in milliseconds, clamped to the track bounds. */
  seekBy: (deltaMs: number) => void;
};

export const playerControlsAtom = atom<PlayerControls | null>(null);
