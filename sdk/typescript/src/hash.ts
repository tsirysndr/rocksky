import { createHash } from "node:crypto";

// Lowercase-hex SHA-256 of s.toLowerCase() — the lowercasing is applied to the
// whole string (not per field), matching Rocksky's server and every other SDK.
function sha256Lower(s: string): string {
  return createHash("sha256").update(s.toLowerCase()).digest("hex");
}

/** Identity hash of a song: sha256(lower("{title} - {artist} - {album}")). */
export function songHash(title: string, artist: string, album: string): string {
  return sha256Lower(`${title} - ${artist} - ${album}`);
}

/** Identity hash of an album: sha256(lower("{album} - {albumArtist}")). */
export function albumHash(album: string, albumArtist: string): string {
  return sha256Lower(`${album} - ${albumArtist}`);
}

/** Identity hash of an artist: sha256(lower(albumArtist)) — a single field. */
export function artistHash(albumArtist: string): string {
  return sha256Lower(albumArtist);
}
