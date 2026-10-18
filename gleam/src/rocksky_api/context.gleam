//// Everything a handler needs, built once at startup.

import gleam/javascript/promise
import gleam/list
import gleam/option.{None, Some}
import gleam/string
import rocksky_api/atproto/identity.{type Resolver}
import rocksky_api/atproto/oauth.{type Client as OauthClient}
import rocksky_api/auth/client
import rocksky_api/auth/store.{type Store}
import rocksky_api/db/db.{type Db}
import rocksky_api/env.{type Env}
import rocksky_api/error
import rocksky_api/kv.{type Kv, type Memory}
import rocksky_api/lib/id_resolver
import rocksky_api/lib/pds_proxy
import rocksky_api/log
import rocksky_api/node/axios.{type Instance}
import rocksky_api/node/nats.{type Connection}
import rocksky_api/node/process
import rocksky_api/node/redis.{type Client as Redis}
import rocksky_api/node/typesense.{type Client as Typesense}
import rocksky_api/task.{type Task}
import rocksky_api/telemetry/metrics.{type Metrics}

pub type Context {
  Context(
    env: Env,
    oauth_client: OauthClient,
    resolver: Resolver,
    /// One-shot values for the OAuth login flow (`cli:<handle>`, `<did>` → token).
    kv: Memory,
    /// Primary: writes, and reads that must be fresh.
    db: Db,
    /// Replica (the primary when unconfigured): lag-tolerant reads.
    read_db: Db,
    nc: Connection,
    analytics: Instance,
    tracklist: Instance,
    matching: Instance,
    musicbrainz: Instance,
    deezer: Instance,
    discogs: Instance,
    redis: Redis,
    typesense: Typesense,
    sqlite: Store,
    sqlite_kv: Kv,
    metrics: Metrics,
  )
}

pub const scopes = client.scopes

pub fn scope_string() -> String {
  client.scope_string()
}

pub fn create(env: Env, metrics: Metrics) -> Task(Context) {
  let overrides = pds_proxy.parse_overrides(env.pds_host_overrides)
  oauth.install_pds_proxy_fetch(overrides)
  case overrides {
    [] -> Nil
    _ ->
      log.info(
        "PDS host overrides active: "
        <> string.join(
          list.map(overrides, fn(p) { p.0 <> " -> " <> p.1 }),
          ", ",
        ),
      )
  }

  use sqlite <- task.then(task.from_result(store.open(env.db_path)))
  use sqlite_kv <- task.then(task.from_result(kv.open(env.kv_db_path)))
  let pools = db.open(env)
  use _ <- task.then(
    db.ensure_writable(pools.primary)
    |> task.rescue(fn(e) {
      log.error(
        "[db] PRIMARY IS NOT WRITABLE — every write will fail. "
        <> error.to_string(e),
      )
      task.ok(Nil)
    }),
  )
  use oauth_client <- task.then(client.create(env, sqlite, overrides))
  use nc <- task.then(task.attempt_result(nats.connect(env.nats_url)))
  use redis <- task.then(
    task.attempt_result(
      redis.connect(env.redis_url, fn(e) {
        log.error_exception("Uncaught Redis Client Error", e)
        process.exit(1)
      }),
    ),
  )
  let resolver = id_resolver.create(env.plc_directory_url, sqlite_kv)
  task.ok(Context(
    env:,
    oauth_client:,
    resolver:,
    kv: kv.new_memory(),
    db: pools.primary,
    read_db: pools.replica,
    nc:,
    analytics: axios.create(env.analytics, None),
    tracklist: axios.create(env.tracklist, None),
    matching: axios.create(env.matching_url, Some(10_000)),
    musicbrainz: axios.create(env.musicbrainz_url, None),
    deezer: axios.create(env.deezer_url, None),
    discogs: axios.create(env.discogs_url, Some(45_000)),
    redis:,
    typesense: typesense.client(
      env.typesense_host,
      env.typesense_port,
      env.typesense_protocol,
      env.typesense_api_key,
      5,
    ),
    sqlite:,
    sqlite_kv:,
    metrics:,
  ))
}

pub fn wait(t: Task(a)) -> promise.Promise(Result(a, error.Error)) {
  t
}
