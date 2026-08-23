import type { CreateScrobbleInput } from "@rocksky/sdk";
import { invoke } from "@tauri-apps/api/core";
import { rocksky } from "../lib/rocksky";
import { isTauri } from "../lib/tauri";

export interface ScrobbleInput {
  title: string;
  artist: string;
  albumArtist: string;
  album?: string;
  duration?: number; // milliseconds
  albumArt?: string;
  timestamp?: number; // unix timestamp in seconds
  trackNumber?: number;
  copyrightMessage?: string;
  genres?: string[];
  releaseDate?: string;
  year?: number;
}

export const submitScrobble = async (input: ScrobbleInput): Promise<void> => {
  const payload = Object.fromEntries(
    Object.entries(input).filter(([, v]) => v != null),
  ) as CreateScrobbleInput;
  if (isTauri()) {
    // Native path: the Rust SDK posts this, so the desktop app never depends
    // on the webview's cross-origin fetch behaviour.
    await invoke("scrobble_submit", {
      token: localStorage.getItem("token") ?? "",
      input: payload,
    });
    return;
  }
  await rocksky().createScrobble(payload);
};
