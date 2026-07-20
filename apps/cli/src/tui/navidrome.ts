import { RockskyClient } from "client";
import fs from "fs";
import os from "os";
import path from "path";
import { playerController, type QueueItem } from "./player";

export const NAVIDROME_URL = "https://navidrome.rocksky.app";
const credsPath = () => path.join(os.homedir(), ".rocksky", "navidrome.json");

export interface NavidromeCreds {
  handle: string;
  apiKey: string;
}

let cachedCreds: NavidromeCreds | null = null;

/**
 * Subsonic credentials for the Navidrome-compatible API: the user's handle plus
 * a dedicated Rocksky API key (created once and cached in ~/.rocksky).
 */
export async function getCreds(token?: string): Promise<NavidromeCreds | null> {
  if (cachedCreds) return cachedCreds;
  try {
    const c = JSON.parse(fs.readFileSync(credsPath(), "utf-8"));
    if (c.handle && c.apiKey) return (cachedCreds = c);
  } catch {
    // fall through to create one
  }
  if (!token) return null;
  const client = new RockskyClient(token);
  const user = await client.getCurrentUser();
  const key = await client.createApiKey("rocksky-cli");
  const creds: NavidromeCreds = { handle: user.handle, apiKey: key.api_key };
  try {
    fs.mkdirSync(path.dirname(credsPath()), { recursive: true });
    fs.writeFileSync(credsPath(), JSON.stringify(creds));
  } catch {
    // best-effort cache
  }
  return (cachedCreds = creds);
}

function restUrl(
  method: string,
  creds: NavidromeCreds,
  params: Record<string, string> = {},
) {
  const qs = new URLSearchParams({
    u: creds.handle,
    p: creds.apiKey,
    c: "rocksky",
    v: "1.16.1",
    f: "json",
    ...params,
  });
  return `${NAVIDROME_URL}/rest/${method}?${qs}`;
}

async function call(
  method: string,
  creds: NavidromeCreds,
  params: Record<string, string> = {},
) {
  const res = await fetch(restUrl(method, creds, params));
  const json = await res.json();
  const r = json["subsonic-response"];
  if (!r || r.status !== "ok") {
    throw new Error(r?.error?.message || `${method} failed`);
  }
  return r;
}

export interface Playlist {
  id: string;
  name: string;
  songCount: number;
  comment?: string;
}
export interface PlaylistEntry {
  id: string;
  title: string;
  artist: string;
  album?: string;
  duration?: number; // seconds (Subsonic)
}

const asArray = <T>(v: T | T[] | undefined): T[] =>
  Array.isArray(v) ? v : v ? [v] : [];

export async function getPlaylists(creds: NavidromeCreds): Promise<Playlist[]> {
  const r = await call("getPlaylists", creds);
  return asArray<Playlist>(r.playlists?.playlist);
}

export function star(creds: NavidromeCreds, songId: string) {
  return call("star", creds, { id: songId });
}
export function unstar(creds: NavidromeCreds, songId: string) {
  return call("unstar", creds, { id: songId });
}

/** The user's starred (loved) songs that are streamable via Navidrome. */
export async function getStarred(creds: NavidromeCreds): Promise<PlaylistEntry[]> {
  const r = await call("getStarred2", creds);
  return asArray<PlaylistEntry>(r.starred2?.song);
}

export async function getPlaylist(
  creds: NavidromeCreds,
  id: string,
): Promise<{ playlist: Playlist; entries: PlaylistEntry[] }> {
  const r = await call("getPlaylist", creds, { id });
  return { playlist: r.playlist, entries: asArray<PlaylistEntry>(r.playlist?.entry) };
}

export async function createPlaylist(
  creds: NavidromeCreds,
  name: string,
): Promise<string | undefined> {
  const r = await call("createPlaylist", creds, { name });
  return r.playlist?.id;
}

export function deletePlaylist(creds: NavidromeCreds, id: string) {
  return call("deletePlaylist", creds, { id });
}

export function addTrackToPlaylist(
  creds: NavidromeCreds,
  playlistId: string,
  songId: string,
) {
  return call("updatePlaylist", creds, { playlistId, songIdToAdd: songId });
}

export function removeTrackFromPlaylist(
  creds: NavidromeCreds,
  playlistId: string,
  index: number,
) {
  return call("updatePlaylist", creds, {
    playlistId,
    songIndexToRemove: String(index),
  });
}

/** Direct Subsonic stream URL — the player can queue these http(s) URLs. */
export function streamUrl(creds: NavidromeCreds, songId: string) {
  return restUrl("stream", creds, { id: songId });
}

/**
 * Create a playlist named `name` containing the given song ids. Each track is
 * added independently — one failing track (e.g. a stale id) doesn't abort the
 * rest. Returns the new id plus how many tracks were actually added.
 */
export async function exportQueue(
  creds: NavidromeCreds,
  name: string,
  songIds: string[],
): Promise<{ id: string; added: number; failed: number }> {
  const id = await createPlaylist(creds, name);
  if (!id) throw new Error("Failed to create playlist");
  let added = 0;
  let failed = 0;
  for (const songId of songIds) {
    try {
      await addTrackToPlaylist(creds, id, songId);
      added++;
    } catch {
      failed++;
    }
  }
  return { id, added, failed };
}

/** Play queue items that carry a Subsonic `trackId`, streaming via Navidrome. */
export async function playByTrackIds(
  creds: NavidromeCreds,
  items: QueueItem[],
  index = 0,
) {
  const playable = items.filter((i) => i.trackId);
  if (playable.length === 0) return;
  const urls = playable.map((i) => streamUrl(creds, i.trackId!));
  await playerController.playQueue(playable, urls, index);
}

/** Insert Navidrome-streamed items at any queue position (play next/last/…). */
export async function enqueueByTrackIds(
  creds: NavidromeCreds,
  items: QueueItem[],
  position: number,
) {
  const playable = items.filter((i) => i.trackId);
  if (playable.length === 0) return;
  const urls = playable.map((i) => streamUrl(creds, i.trackId!));
  await playerController.insertAt(playable, urls, position);
}

const entryToItem = (e: PlaylistEntry): QueueItem => ({
  uploadId: "",
  trackId: e.id,
  title: e.title,
  artist: e.artist,
  album: e.album,
  duration: e.duration ? e.duration * 1000 : undefined,
});

/** Play a playlist's entries, streaming each via the Navidrome API. */
export async function playEntries(
  creds: NavidromeCreds,
  entries: PlaylistEntry[],
  index = 0,
) {
  if (entries.length === 0) return;
  await playerController.playQueue(
    entries.map(entryToItem),
    entries.map((e) => streamUrl(creds, e.id)),
    index,
  );
}
