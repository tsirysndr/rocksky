import { ROCKSKY_API_URL, RockskyClient } from "client";
import fs from "fs";
import os from "os";
import path from "path";
import type { QueueItem } from "./player";

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

/**
 * Playlist writes go through the Rocksky API rather than straight to Navidrome.
 * It runs the same Subsonic call and then mirrors the change onto the user's
 * PDS as an app.rocksky.playlist record; calling Navidrome directly would skip
 * the mirror and silently drift the repo from the library. Reads stay direct.
 */
async function libraryProcedure(
  token: string,
  method: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const res = await fetch(`${ROCKSKY_API_URL}/xrpc/app.rocksky.library.${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok) {
    throw new Error(
      (json?.message as string) || `library.${method} failed (${res.status})`,
    );
  }
  // The library change committed; only the PDS record didn't. Surfaced as an
  // error so the caller says so, rather than reporting a clean success.
  if (json?.atprotoError) throw new Error(json.atprotoError as string);
  return json ?? {};
}

export interface Playlist {
  id: string;
  name: string;
  songCount: number;
  comment?: string;
  /** AT-URI of the app.rocksky.playlist record this playlist is mirrored to. */
  uri?: string;
}

export interface Album {
  id: string;
  name: string;
  artist: string;
  songCount: number;
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

export async function getAlbum(
  creds: NavidromeCreds,
  id: string,
): Promise<{ album: Album; entries: PlaylistEntry[] }> {
  const r = await call("getAlbum", creds, { id });
  return { album: r.album, entries: asArray<PlaylistEntry>(r.album?.song) };
}

/**
 * Find the library album behind a title/artist pair. Used when writing an NFC
 * tag: the My Music list comes from the uploads API, which has no Navidrome id,
 * but the tag has to carry one so the desktop app can play the same tag.
 * Deliberately exact (case-insensitive) — a near-miss would burn a tag that
 * silently plays the wrong record.
 */
export async function findAlbumId(
  creds: NavidromeCreds,
  name: string,
  artist: string,
): Promise<string | null> {
  const r = await call("search3", creds, {
    query: name,
    albumCount: "50",
    songCount: "0",
    artistCount: "0",
  });
  const albums = asArray<Album>(r.searchResult3?.album);
  const eq = (a: string, b: string) =>
    a?.trim().toLowerCase() === b?.trim().toLowerCase();
  const matches = albums.filter(
    (a) => eq(a.name, name) && (!artist || eq(a.artist, artist)),
  );
  return matches.length === 1 ? matches[0].id : null;
}

export async function createPlaylist(
  token: string,
  name: string,
): Promise<string | undefined> {
  const r = await libraryProcedure(token, "createPlaylist", { name });
  return (r.playlist as { id?: string } | undefined)?.id;
}

export function deletePlaylist(token: string, id: string) {
  return libraryProcedure(token, "deletePlaylist", { id });
}

export function addTrackToPlaylist(
  token: string,
  playlistId: string,
  songId: string,
) {
  return libraryProcedure(token, "updatePlaylist", {
    playlistId,
    songIdToAdd: songId,
  });
}

export function removeTrackFromPlaylist(
  token: string,
  playlistId: string,
  index: number,
) {
  return libraryProcedure(token, "updatePlaylist", {
    playlistId,
    songIndexToRemove: index,
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
  token: string,
  name: string,
  songIds: string[],
): Promise<{ id: string; added: number; failed: number }> {
  const id = await createPlaylist(token, name);
  if (!id) throw new Error("Failed to create playlist");
  let added = 0;
  let failed = 0;
  for (const songId of songIds) {
    try {
      await addTrackToPlaylist(token, id, songId);
      added++;
    } catch {
      failed++;
    }
  }
  return { id, added, failed };
}

export const entryToItem = (e: PlaylistEntry): QueueItem => ({
  uploadId: "",
  trackId: e.id,
  title: e.title,
  artist: e.artist,
  album: e.album,
  duration: e.duration ? e.duration * 1000 : undefined,
});
