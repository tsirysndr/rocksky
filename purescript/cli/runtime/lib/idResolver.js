import { IdResolver } from "@atproto/identity";
import { StorageCache } from "./didUnstorageCache.js";
const HOUR = 6e4 * 60;
const DAY = HOUR * 24;
const WEEK = HOUR * 7;
function createIdResolver(kv) {
  return new IdResolver({
    didCache: new StorageCache({
      store: kv,
      prefix: "didCache:",
      staleTTL: DAY,
      maxTTL: WEEK
    })
  });
}
function createBidirectionalResolver(resolver) {
  return {
    async resolveDidToHandle(did) {
      const didDoc = await resolver.did.resolveAtprotoData(did);
      resolver.handle.resolve(didDoc.handle).then((resolvedHandle) => {
        if (resolvedHandle !== did) {
          resolver.did.ensureResolve(did, true);
        }
      });
      return didDoc?.handle ?? did;
    },
    async resolveDidsToHandles(dids) {
      const didHandleMap = {};
      const resolves = await Promise.all(
        dids.map((did) => this.resolveDidToHandle(did).catch((_) => did))
      );
      for (let i = 0; i < dids.length; i++) {
        didHandleMap[dids[i]] = resolves[i];
      }
      return didHandleMap;
    }
  };
}
export {
  createBidirectionalResolver,
  createIdResolver
};
