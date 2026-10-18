//// A TTL cache for handler lookups. Build once at registration; concurrent
//// lookups for the same key share one in-flight task, failures are never kept.

import rocksky_api/task.{type Task}

pub type Cache(k, v)

@external(javascript, "./query_cache_ffi.mjs", "create")
fn create_ffi(ttl_ms: Int, capacity: Int) -> Cache(k, v)

@external(javascript, "./query_cache_ffi.mjs", "get")
fn get_ffi(cache: Cache(k, v), key: String, lookup: fn() -> Task(v)) -> Task(v)

pub fn new(ttl_ms: Int, capacity: Int) -> Cache(k, v) {
  create_ffi(ttl_ms, capacity)
}

/// `key` must identify the params by value (e.g. their JSON or a joined string).
pub fn get(
  cache: Cache(k, v),
  key: String,
  lookup: fn() -> Task(v),
) -> Task(v) {
  get_ffi(cache, key, lookup)
}

pub fn cached(
  ttl_ms: Int,
  capacity: Int,
  key: fn(p) -> String,
  lookup: fn(p) -> Task(v),
) -> fn(p) -> Task(v) {
  let cache = new(ttl_ms, capacity)
  fn(params) { get(cache, key(params), fn() { lookup(params) }) }
}
