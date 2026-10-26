const HOUR = 6e4 * 60;
const DAY = HOUR * 24;
class StorageCache {
  staleTTL;
  maxTTL;
  cache;
  prefix;
  constructor({
    store,
    prefix,
    staleTTL,
    maxTTL
  }) {
    this.cache = store;
    this.prefix = prefix;
    this.staleTTL = staleTTL ?? HOUR;
    this.maxTTL = maxTTL ?? DAY;
  }
  async cacheDid(did, doc) {
    await this.cache.set(this.prefix + did, { doc, updatedAt: Date.now() });
  }
  async refreshCache(did, getDoc) {
    const doc = await getDoc();
    if (doc) {
      await this.cacheDid(did, doc);
    }
  }
  async checkCache(did) {
    const val = await this.cache.get(this.prefix + did);
    if (!val) return null;
    const now = Date.now();
    const expired = now > val.updatedAt + this.maxTTL;
    const stale = now > val.updatedAt + this.staleTTL;
    return {
      ...val,
      did,
      stale,
      expired
    };
  }
  async clearEntry(did) {
    await this.cache.remove(this.prefix + did);
  }
  async clear() {
    await this.cache.clear(this.prefix);
  }
}
export {
  StorageCache
};
