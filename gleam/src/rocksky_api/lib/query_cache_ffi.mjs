import { Ok } from "../../gleam.mjs";

export const create = (ttl, capacity) => ({ ttl, capacity, entries: new Map() });

export const get = (cache, key, lookup) => {
  const now = Date.now();
  const hit = cache.entries.get(key);
  if (hit && (hit.pending || hit.expires > now)) return hit.promise;
  const promise = lookup().then((result) => {
    const entry = cache.entries.get(key);
    if (entry && entry.promise === promise) {
      if (result instanceof Ok) {
        entry.pending = false;
        entry.expires = Date.now() + cache.ttl;
      } else {
        cache.entries.delete(key);
      }
    }
    return result;
  });
  cache.entries.delete(key);
  cache.entries.set(key, { promise, pending: true, expires: 0 });
  while (cache.entries.size > cache.capacity) {
    cache.entries.delete(cache.entries.keys().next().value);
  }
  return promise;
};
