import { createHash } from "node:crypto";
import { consola } from "consola";
import type { Context } from "context";
import { eq } from "drizzle-orm";
import type { MatchedCandidate } from "lib/matching";
import tables from "schema";
import type { SelectTrack } from "schema/tracks";

const hash = (text: string) =>
  createHash("sha256").update(text.toLowerCase()).digest("hex");
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

// Hashes are the indexed identities used by catalog ingestion. Enrichment must
// never perform title-only matching or manufacture an AT URI from a provider ID.
export async function catalogIdentity(
  ctx: Context,
  candidate: MatchedCandidate,
  selected?: SelectTrack,
) {
  const artist = candidate.artists.join(", ");
  const album = candidate.album;
  const albumArtist = candidate.albumArtist ?? candidate.artists[0];
  const results = await Promise.allSettled([
    selected
      ? Promise.resolve([selected])
      : album
        ? ctx.readDb
            .select()
            .from(tables.tracks)
            .where(
              eq(
                tables.tracks.sha256,
                hash(`${candidate.title} - ${artist} - ${album}`),
              ),
            )
            .limit(1)
        : Promise.resolve([]),
    album
      ? ctx.readDb
          .select()
          .from(tables.albums)
          .where(eq(tables.albums.sha256, hash(`${album} - ${albumArtist}`)))
          .limit(1)
      : Promise.resolve([]),
    ctx.readDb
      .select()
      .from(tables.artists)
      .where(eq(tables.artists.sha256, hash(albumArtist)))
      .limit(1),
  ]);
  for (const result of results) {
    if (result.status === "rejected")
      consola.warn("Song match catalog enrichment unavailable");
  }
  let record =
    results[0].status === "fulfilled" ? results[0].value[0] : undefined;
  const albumRecord =
    results[1].status === "fulfilled" ? results[1].value[0] : undefined;
  const artistRecord =
    results[2].status === "fulfilled" ? results[2].value[0] : undefined;
  if (record && !selected) {
    const ids = candidate.identifiers;
    const conflictingIsrc =
      ids.isrc &&
      record.isrc &&
      ids.isrc.replaceAll("-", "").toUpperCase() !==
        record.isrc.replaceAll("-", "").toUpperCase();
    const conflictingMbid =
      ids.musicbrainzRecordingId &&
      record.mbId &&
      !same(ids.musicbrainzRecordingId, record.mbId);
    const conflictingDuration =
      candidate.durationMs &&
      record.duration > 1 &&
      Math.abs(candidate.durationMs - record.duration) >
        Math.max(5000, candidate.durationMs / 50);
    if (
      !same(record.title, candidate.title) ||
      !same(record.artist, artist) ||
      !same(record.album, album ?? "") ||
      conflictingIsrc ||
      conflictingMbid ||
      conflictingDuration
    )
      record = undefined;
  }
  const matchingAlbum =
    albumRecord &&
    same(albumRecord.title, album ?? "") &&
    same(albumRecord.artist, albumArtist)
      ? albumRecord
      : undefined;
  const matchingArtist =
    artistRecord && same(artistRecord.name, albumArtist)
      ? artistRecord
      : undefined;
  // A catalog candidate may refer to a joined release instead of its track's
  // original album. Never attach that original album's URI to a joined release.
  const sameAlbum =
    record &&
    same(record.album, album ?? "") &&
    same(record.albumArtist, albumArtist);
  return {
    record,
    uri: record?.uri ?? null,
    albumUri:
      matchingAlbum?.uri ?? (sameAlbum ? record?.albumUri : null) ?? null,
    artistUri:
      matchingArtist?.uri ??
      (record && same(record.albumArtist, albumArtist)
        ? record.artistUri
        : null) ??
      null,
  };
}
