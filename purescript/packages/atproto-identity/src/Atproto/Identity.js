import { IdResolver } from "@atproto/identity";

export const mkDidCacheImpl = (c) => ({
  cacheDid: (did, doc) => c.cacheDid(did, doc),
  checkCache: (did) => c.checkCache(did)().then((r) => r ?? null),
  refreshCache: (did, getDoc) => c.refreshCache(did, () => getDoc().then((d) => d ?? null)),
  clearEntry: (did) => c.clearEntry(did)(),
  clear: () => c.clear(),
});

export const createIdResolver = (plcUrl) => (didCache) => () => new IdResolver({ plcUrl, didCache });
export const resolveHandleImpl = (r) => (handle) => () => r.handle.resolve(handle).then((d) => d ?? null);
export const resolveAtprotoDataImpl = (r) => (did) => () => r.did.resolveAtprotoData(did);
export const ensureResolveImpl = (r) => (did) => (force) => () => r.did.ensureResolve(did, force);
export const resolveDidDocumentImpl = (r) => (did) => () => r.did.resolve(did).then((d) => d ?? null);
