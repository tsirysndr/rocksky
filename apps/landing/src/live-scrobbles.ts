import type { ScrobbleViewBasic } from "@rocksky/sdk";
import { normalizeScrobble } from "./normalize";

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
function string(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

// The public websocket sends joined Drizzle rows; tolerate flat AppView rows too.
export function liveScrobbles(message: unknown): ScrobbleViewBasic[] | null {
  const rows = object(message)?.scrobbles;
  if (!Array.isArray(rows)) return null;
  if (!rows.length) return [];
  const tracks: ScrobbleViewBasic[] = [];
  for (const value of rows) {
    const row = object(value);
    if (!row) continue;
    const record = object(row.scrobbles);
    const track = object(row.tracks);
    const listener = object(row.users);
    if (record && track && listener) {
      const uri = string(record.uri);
      const id = string(record.id);
      if (!uri && !id) continue;
      tracks.push({
        id,
        uri,
        title: string(track.title),
        artist: string(track.artist),
        album: string(track.album),
        albumArt: string(track.albumArt),
        trackUri: string(track.uri),
        did: string(listener.did),
        handle: string(listener.handle),
        avatar: string(listener.avatar),
        createdAt: string(record.timestamp) || string(record.createdAt),
      });
    } else if (
      typeof row.title === "string" &&
      (typeof row.uri === "string" || typeof row.id === "string")
    ) {
      tracks.push(
        normalizeScrobble({
          id: string(row.id),
          uri: string(row.uri),
          title: row.title,
          artist: string(row.artist),
          album: string(row.album),
          trackUri: string(row.trackUri),
          albumArt: string(row.albumArt) || string(row.cover),
          did: string(row.did),
          handle: string(row.handle) || string(row.user),
          avatar: string(row.avatar) || string(row.userAvatar),
          createdAt: string(row.createdAt) || string(row.date),
        }),
      );
    }
  }
  if (!tracks.length) return null;
  return [
    ...new Map(tracks.map((track) => [scrobbleKey(track), track])).values(),
  ]
    .sort(
      (a, b) =>
        (Date.parse(b.createdAt || "") || 0) -
        (Date.parse(a.createdAt || "") || 0),
    )
    .slice(0, 12);
}

export function scrobbleKey(track: ScrobbleViewBasic) {
  return (
    track.uri ||
    track.id ||
    `${track.did || track.handle}|${track.createdAt}|${track.trackUri || track.title}|${track.artist}`
  );
}
