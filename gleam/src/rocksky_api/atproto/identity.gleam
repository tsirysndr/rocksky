//// Binding to `@atproto/identity` and `@atproto/syntax`.

import gleam/dynamic.{type Dynamic}
import gleam/javascript/promise.{type Promise}
import gleam/option.{type Option}
import rocksky_api/node/js.{type Exception}

pub type Resolver

pub type AtprotoData {
  AtprotoData(did: String, handle: String, pds: String, signing_key: String)
}

pub type CacheEntry {
  CacheEntry(doc: Dynamic, updated_at: Int, stale: Bool, expired: Bool)
}

/// A DID-document cache implemented by the caller.
pub type DidCache {
  DidCache(
    cache_did: fn(String, Dynamic) -> Promise(Nil),
    check_cache: fn(String) -> Promise(Option(CacheEntry)),
    refresh_cache: fn(String, fn() -> Promise(Option(Dynamic))) -> Promise(Nil),
    clear_entry: fn(String) -> Promise(Nil),
    clear: fn() -> Promise(Nil),
  )
}

@external(javascript, "./identity_ffi.mjs", "createResolver")
pub fn create_resolver(plc_url: String, cache: DidCache) -> Resolver

@external(javascript, "./identity_ffi.mjs", "resolveAtprotoData")
pub fn resolve_atproto_data(
  resolver: Resolver,
  did: String,
) -> Promise(Result(AtprotoData, Exception))

/// Handle → DID, `None` when the handle does not resolve.
@external(javascript, "./identity_ffi.mjs", "resolveHandle")
pub fn resolve_handle(
  resolver: Resolver,
  handle: String,
) -> Promise(Result(Option(String), Exception))

@external(javascript, "./identity_ffi.mjs", "ensureResolve")
pub fn ensure_resolve(
  resolver: Resolver,
  did: String,
  force_refresh: Bool,
) -> Promise(Result(Dynamic, Exception))

@external(javascript, "./identity_ffi.mjs", "isValidHandle")
pub fn is_valid_handle(handle: String) -> Bool

@external(javascript, "./identity_ffi.mjs", "isValidDid")
pub fn is_valid_did(did: String) -> Bool
