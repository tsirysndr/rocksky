//// DID ⇄ handle resolution with a SQLite-backed DID document cache.

import gleam/dict.{type Dict}
import gleam/dynamic.{type Dynamic}
import gleam/dynamic/decode
import gleam/javascript/promise.{type Promise}
import gleam/list
import gleam/option.{None, Some}
import gleam/result
import rocksky_api/atproto/identity.{type Resolver}
import rocksky_api/kv.{type Kv}
import rocksky_api/node/js
import rocksky_api/task.{type Task}

const day = 86_400_000

const week = 604_800_000

const prefix = "didCache:"

pub fn create(plc_url: String, kv: Kv) -> Resolver {
  identity.create_resolver(plc_url, did_cache(kv, day, week))
}

fn did_cache(kv: Kv, stale_ttl: Int, max_ttl: Int) -> identity.DidCache {
  let cache_did = fn(did, doc: Dynamic) {
    let entry =
      js.object([#("doc", doc), #("updatedAt", dynamic.int(js.now_ms()))])
    let _ = kv.set(kv, prefix <> did, js.stringify(entry))
    promise.resolve(Nil)
  }
  identity.DidCache(
    cache_did:,
    check_cache: fn(did) {
      let entry = {
        use raw <- result.try(
          kv.get(kv, prefix <> did) |> result.replace_error(Nil),
        )
        use raw <- result.try(option.to_result(raw, Nil))
        use parsed <- result.try(
          js.parse_json(raw) |> result.replace_error(Nil),
        )
        decode.run(parsed, {
          use doc <- decode.field("doc", decode.dynamic)
          use updated_at <- decode.field("updatedAt", decode.int)
          decode.success(#(doc, updated_at))
        })
        |> result.replace_error(Nil)
      }
      promise.resolve(case entry {
        Ok(#(doc, updated_at)) -> {
          let now = js.now_ms()
          Some(identity.CacheEntry(
            doc:,
            updated_at:,
            stale: now > updated_at + stale_ttl,
            expired: now > updated_at + max_ttl,
          ))
        }
        Error(_) -> None
      })
    },
    refresh_cache: fn(did, get_doc) {
      use doc <- promise.await(get_doc())
      case doc {
        Some(doc) -> cache_did(did, doc)
        None -> promise.resolve(Nil)
      }
    },
    clear_entry: fn(did) {
      let _ = kv.remove(kv, prefix <> did)
      promise.resolve(Nil)
    },
    clear: fn() {
      let _ = kv.clear(kv, prefix)
      promise.resolve(Nil)
    },
  )
}

/// The handle for a DID, falling back to the DID itself. Also kicks off a
/// background check that the handle resolves back to the DID.
pub fn resolve_did_to_handle(resolver: Resolver, did: String) -> Task(String) {
  use data <- task.map(
    task.attempt_result(identity.resolve_atproto_data(resolver, did)),
  )
  let handle = data.handle
  task.background(
    task.then(
      task.attempt_result(identity.resolve_handle(resolver, handle)),
      fn(resolved) {
        case resolved {
          Some(d) if d == did -> task.ok(Nil)
          _ ->
            task.map(
              task.attempt_result(identity.ensure_resolve(resolver, did, True)),
              fn(_) { Nil },
            )
        }
      },
    ),
    fn(_) { Nil },
  )
  case handle {
    "" -> did
    _ -> handle
  }
}

pub fn resolve_dids_to_handles(
  resolver: Resolver,
  dids: List(String),
) -> Promise(Dict(String, String)) {
  use handles <- promise.map(
    promise.await_list(
      list.map(dids, fn(did) {
        task.unwrap_or(resolve_did_to_handle(resolver, did), fn(_) { did })
      }),
    ),
  )
  dict.from_list(list.zip(dids, handles))
}
