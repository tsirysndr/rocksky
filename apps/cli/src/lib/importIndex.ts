import { RockskyIndex, type IndexStats } from "@rocksky/sdk/dedup";
import { MemoryBlockstore, Repo, readCarWithRoot } from "@atproto/repo";

const COLLECTION = "app.rocksky.scrobble";
const normalize = (s: string) => s.normalize("NFC").trim().toLowerCase();

/** A play's identity does not depend on which release supplied its album metadata. */
export class ImportIndex extends RockskyIndex {
  private plays = new Map<string, Set<string>>();
  private identities = new Map<string, string>();
  duplicateHits = 0;

  private key(did: string, title: string, artist: string, secs: number): string {
    return JSON.stringify([did, normalize(title), normalize(artist), secs]);
  }

  private forget(uri: string): void {
    const key = this.identities.get(uri);
    if (key === undefined) return;
    const uris = this.plays.get(key)!;
    uris.delete(uri);
    if (!uris.size) this.plays.delete(key);
    this.identities.delete(uri);
  }

  private remember(did: string, uri: string, record: Record<string, unknown>): void {
    this.forget(uri);
    const { title, artist, createdAt } = record;
    if (typeof title !== "string" || typeof artist !== "string" || typeof createdAt !== "string") return;
    const secs = Math.floor(Date.parse(createdAt) / 1000);
    if (!title.trim() || !artist.trim() || !Number.isFinite(secs)) return;
    const key = this.key(did, title, artist, secs);
    const uris = this.plays.get(key) ?? new Set<string>();
    uris.add(uri);
    this.plays.set(key, uris);
    this.identities.set(uri, key);
  }

  override async indexCar(did: string, car: Uint8Array): Promise<IndexStats> {
    // Walk only records reachable from the current repository root. Rebuild on
    // each run so stale entries from deleted records cannot hide missing plays.
    const { root, blocks } = await readCarWithRoot(car);
    const repo = await Repo.load(new MemoryBlockstore(blocks), root);
    if (repo.did !== did) throw new Error("Dedup repository DID does not match the signed-in account");
    this.plays.clear();
    this.identities.clear();
    let scrobbles = 0;
    for await (const entry of repo.walkRecords()) {
      if (entry.collection !== COLLECTION) continue;
      const uri = `at://${did}/${COLLECTION}/${entry.rkey}`;
      this.remember(did, uri, entry.record);
      if (this.identities.has(uri)) scrobbles++;
    }
    const stats = await super.indexCar(did, car);
    return { ...stats, scrobbles };
  }

  override async scrobbleUri(did: string, title: string, artist: string, _album: string, secs: number): Promise<string | undefined> {
    const uri = this.plays.get(this.key(did, title, artist, secs))?.values().next().value;
    if (uri) this.duplicateHits++;
    return uri;
  }

  override async recordScrobble(did: string, title: string, artist: string, album: string, secs: number, uri: string): Promise<void> {
    // Remember immediately, even if the persistent SDK index write fails.
    this.remember(did, uri, { title, artist, createdAt: new Date(secs * 1000).toISOString() });
    await super.recordScrobble(did, title, artist, album, secs, uri);
  }

  override async applyCommit(did: string, col: string, operation: string, rkey: string, record: Record<string, unknown> | undefined): Promise<void> {
    if (col === COLLECTION) {
      const uri = `at://${did}/${col}/${rkey}`;
      if (operation === "delete") this.forget(uri);
      else if ((operation === "create" || operation === "update") && record) this.remember(did, uri, record);
    }
    await super.applyCommit(did, col, operation, rkey, record);
  }
}
