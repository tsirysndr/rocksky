import { RockskyIndex } from "@rocksky/sdk/dedup";
import { MemoryBlockstore, Repo, readCarWithRoot } from "@atproto/repo";
const COLLECTION = "app.rocksky.scrobble";
const normalize = (s) => s.normalize("NFC").trim().toLowerCase();
class ImportIndex extends RockskyIndex {
  plays = /* @__PURE__ */ new Map();
  identities = /* @__PURE__ */ new Map();
  duplicateHits = 0;
  key(did, title, artist, secs) {
    return JSON.stringify([did, normalize(title), normalize(artist), secs]);
  }
  forget(uri) {
    const key = this.identities.get(uri);
    if (key === void 0) return;
    const uris = this.plays.get(key);
    uris.delete(uri);
    if (!uris.size) this.plays.delete(key);
    this.identities.delete(uri);
  }
  remember(did, uri, record) {
    this.forget(uri);
    const { title, artist, createdAt } = record;
    if (typeof title !== "string" || typeof artist !== "string" || typeof createdAt !== "string") return;
    const secs = Math.floor(Date.parse(createdAt) / 1e3);
    if (!title.trim() || !artist.trim() || !Number.isFinite(secs)) return;
    const key = this.key(did, title, artist, secs);
    const uris = this.plays.get(key) ?? /* @__PURE__ */ new Set();
    uris.add(uri);
    this.plays.set(key, uris);
    this.identities.set(uri, key);
  }
  async indexCar(did, car) {
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
  async scrobbleUri(did, title, artist, _album, secs) {
    const uri = this.plays.get(this.key(did, title, artist, secs))?.values().next().value;
    if (uri) this.duplicateHits++;
    return uri;
  }
  async recordScrobble(did, title, artist, album, secs, uri) {
    this.remember(did, uri, { title, artist, createdAt: new Date(secs * 1e3).toISOString() });
    await super.recordScrobble(did, title, artist, album, secs, uri);
  }
  async applyCommit(did, col, operation, rkey, record) {
    if (col === COLLECTION) {
      const uri = `at://${did}/${col}/${rkey}`;
      if (operation === "delete") this.forget(uri);
      else if ((operation === "create" || operation === "update") && record) this.remember(did, uri, record);
    }
    await super.applyCommit(did, col, operation, rkey, record);
  }
}
export {
  ImportIndex
};
