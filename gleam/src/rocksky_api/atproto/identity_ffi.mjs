import { IdResolver } from "@atproto/identity";
import { isValidHandle as validHandle, ensureValidDid } from "@atproto/syntax";
import { Ok, Error as GError } from "../../gleam.mjs";
import { Some, None } from "../../../gleam_stdlib/gleam/option.mjs";
import { AtprotoData } from "./identity.mjs";

const opt = (v) => (v === undefined || v === null ? new None() : new Some(v));
const wrap = (p, f = (v) => v) => Promise.resolve(p).then((v) => new Ok(f(v)), (e) => new GError(e));

export const createResolver = (plcUrl, cache) =>
  new IdResolver({
    plcUrl,
    didCache: {
      cacheDid: (did, doc) => cache.cache_did(did, doc),
      checkCache: async (did) => {
        const r = await cache.check_cache(did);
        if (!(r instanceof Some)) return null;
        const e = r[0];
        return { did, doc: e.doc, updatedAt: e.updated_at, stale: e.stale, expired: e.expired };
      },
      refreshCache: (did, getDoc) =>
        cache.refresh_cache(did, () => getDoc().then((d) => opt(d))),
      clearEntry: (did) => cache.clear_entry(did),
      clear: () => cache.clear(),
    },
  });

export const resolveAtprotoData = (resolver, did) =>
  wrap(
    resolver.did.resolveAtprotoData(did),
    (d) => new AtprotoData(d.did, d.handle, d.pds, d.signingKey),
  );
export const resolveHandle = (resolver, handle) => wrap(resolver.handle.resolve(handle), opt);
export const ensureResolve = (resolver, did, force) => wrap(resolver.did.ensureResolve(did, force));
export const isValidHandle = (h) => validHandle(h);
export const isValidDid = (d) => {
  try {
    ensureValidDid(d);
    return true;
  } catch {
    return false;
  }
};
