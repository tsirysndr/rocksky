import type { Agent } from "@rocksky/sdk";
import type { ImportedScrobble } from "./importParsers";

/** Compatibility for published SDKs whose scrobbleMatch only handles empty matches. */
export async function importScrobble(
  agent: Pick<Agent, "scrobbleMatch" | "scrobble">,
  input: ImportedScrobble,
): Promise<string> {
  try {
    return await agent.scrobbleMatch({
      title: input.title,
      artist: input.artist,
      album: input.album,
      mbId: input.mbId,
      isrc: input.isrc,
      timestamp: input.timestamp,
    });
  } catch (error) {
    const e = error as { name?: string; kind?: string; status?: number; message?: string } | null;
    // Match the AppView's explicit miss, not a PDS NotFound or a generic 404.
    // New SDKs handle this inside scrobbleMatch; older installed versions need
    // this bridge so the CLI fix does not depend on an unpublished SDK release.
    if (
      e?.name !== "RockskyError" || e.kind !== "NotFound" ||
      (e.status !== 400 && e.status !== 404) ||
      !["No unambiguous song match", "Song not found"].includes(e.message ?? "")
    ) throw error;
  }
  return agent.scrobble({
    title: input.title,
    artist: input.artist,
    album: input.album ?? "",
    albumArtist: input.artist,
    duration: 0,
    mbid: input.mbId,
    isrc: input.isrc,
    createdAt: new Date(input.timestamp * 1000).toISOString(),
  });
}
