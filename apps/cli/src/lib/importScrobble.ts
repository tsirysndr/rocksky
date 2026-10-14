import type { Agent } from "@rocksky/sdk";
import type { ImportedScrobble } from "./importParsers";
import type { RockskyIndex } from "@rocksky/sdk/dedup";

/** Serialize writes of the same matched play, including concurrent retries. */
export function protectScrobbleWrites(
  agent: Pick<Agent, "did" | "scrobble">,
  index: Pick<RockskyIndex, "scrobbleUri">,
): void {
  const publish = agent.scrobble.bind(agent);
  const running = new Map<string, Promise<string>>();
  agent.scrobble = async (record) => {
    const secs = Math.floor(Date.parse(record.createdAt ?? "") / 1000);
    if (!Number.isFinite(secs)) throw new Error("Imported scrobbles require a valid play timestamp");
    const normalize = (s: string) => s.normalize("NFC").trim().toLowerCase();
    const key = JSON.stringify([normalize(record.title), normalize(record.artist), secs]);
    // Wait for the prior write, then check the index again. A failed write
    // must not poison the next attempt or be mistaken for a completed play.
    while (running.has(key)) await running.get(key)!.catch(() => {});
    const task = (async () => {
      const existing = await index.scrobbleUri(agent.did, record.title, record.artist, record.album, secs);
      return existing ?? await publish(record);
    })();
    running.set(key, task);
    try {
      return await task;
    } finally {
      running.delete(key);
    }
  };
}

/** Compatibility for published SDKs whose scrobbleMatch only handles empty matches. */
export async function importScrobble(
  agent: Pick<Agent, "scrobbleMatch" | "scrobble">,
  input: ImportedScrobble,
  dedup?: { did: string; index: Pick<RockskyIndex, "scrobbleUri"> },
): Promise<string> {
  // Check the original export identity before matchSong can change its metadata.
  // The attached ImportIndex also checks the matched identity inside the SDK.
  if (dedup) {
    const existing = await dedup.index.scrobbleUri(
      dedup.did, input.title, input.artist, input.album ?? "", input.timestamp,
    );
    if (existing) return existing;
  }
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
