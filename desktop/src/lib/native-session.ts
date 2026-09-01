// Bridge to the native now-playing session (src-tauri/src/session.rs).
//
// The OS media controls and scrobbling used to be driven from this webview, on
// setInterval timers. WKWebView/WebView2 throttle those to a crawl (and then to
// nothing) once the window is minimized or fully covered, so with Rocksky in
// the background elapsed time stopped advancing: Now Playing froze on whatever
// was last on screen and tracks finished without ever crossing the scrobble
// threshold. Both now run on the Rust side, off the playback engine.
//
// The webview still owns everything the engine can't see, so it feeds the
// native session three things: the token to scrobble with, which player is the
// source, and the metadata for the tracks it enqueued.
import { invoke } from "@tauri-apps/api/core";
import dayjs from "dayjs";
import { API_URL } from "../consts";
import type { QueueTrack } from "../atoms/queue";
import { isTauri } from "./tauri";

/** Hand the native session the current session token (null clears it). */
export function syncSessionToken(): void {
  if (!isTauri()) return;
  invoke("session_set_token", {
    token: localStorage.getItem("token"),
    apiUrl: API_URL,
  }).catch(() => {
    // Older shell without the command — nothing to keep in sync.
  });
}

/**
 * Tell the native session which player owns playback — the `player` atom,
 * verbatim. It stands down for "spotify" and "device", which only the webview
 * can describe, and drives the OS controls itself otherwise.
 */
export function setSessionSource(player: string | null): void {
  if (!isTauri()) return;
  invoke("session_set_source", { source: player }).catch(() => {
    // Older shell without the command — nothing to keep in sync.
  });
}

/** Register queue metadata by stream URL, so a scrobble built natively carries
 *  the same fields the webview would have sent. */
export function registerSessionTracks(
  tracks: { url: string; track: QueueTrack }[],
): void {
  if (!isTauri() || !tracks.length) return;
  invoke("session_register_tracks", {
    tracks: tracks.map(({ url, track }) => ({
      url,
      uploadId: track.uploadId ?? "",
      title: track.title ?? "",
      artist: track.artist ?? "",
      albumArtist: track.albumArtist || track.artist || "",
      album: track.album ?? "",
      albumArt: track.albumArt ?? "",
      duration: track.duration ?? 0,
      trackNumber: track.trackNumber ?? null,
      copyrightMessage: track.copyrightMessage ?? null,
      genres: track.genre ? [track.genre] : null,
      releaseDate: track.releaseDate
        ? dayjs(track.releaseDate).format("YYYY-MM-DD")
        : null,
      year: track.year ?? null,
    })),
  }).catch(() => {
    // Older shell without the command — nothing to keep in sync.
  });
}
