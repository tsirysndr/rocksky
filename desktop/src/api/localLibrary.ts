import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { isTauri } from "../lib/tauri";

export type LocalTrack = {
  id: string;
  path: string;
  title: string;
  artist: string;
  albumArtist: string;
  album: string;
  durationMs: number;
  trackNumber: number | null;
  discNumber: number | null;
  year: number | null;
  genre: string | null;
  art: string | null;
};
export type LocalAlbum = {
  id: string;
  title: string;
  artist: string;
  artistId: string;
  year: number | null;
  art: string | null;
  trackCount: number;
};
export type LocalArtist = {
  id: string;
  name: string;
  art: string | null;
  albumCount: number;
  trackCount: number;
};
export type LocalStatus = {
  folder: string;
  scan: { state: "idle" | "scanning" | "done"; count: number; error: string | null; rescanQueued: boolean };
  tracks: number;
};

function request<T>(request: Record<string, unknown>): Promise<T> {
  if (!isTauri()) return Promise.reject(new Error("Local music needs the desktop app."));
  return invoke<T>("local_library", { request }).catch((e) => {
    throw new Error(typeof e === "string" ? e : "Local library request failed");
  });
}

export const artUrl = (path: string | null | undefined) => (path ? convertFileSrc(path) : null);

export const localLibrary = {
  status: () => request<LocalStatus>({ cmd: "status" }),
  scan: (force = false) => request<LocalStatus>({ cmd: "scan", force }),
  pickFolder: () => request<LocalStatus | { cancelled: true }>({ cmd: "pickFolder" }),
  tracks: (params: { query?: string; albumId?: string; artistId?: string; offset?: number; limit?: number }) =>
    request<{ tracks: LocalTrack[]; total: number; nextOffset: number | null }>({ cmd: "tracks", ...params }),
  albums: (query = "", artistId?: string) =>
    request<{ albums: LocalAlbum[] }>({ cmd: "albums", query, artistId }),
  artists: (query = "") => request<{ artists: LocalArtist[] }>({ cmd: "artists", query }),
};
