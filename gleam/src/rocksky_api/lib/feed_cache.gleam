//// Version counters that invalidate cached feeds.

import gleam/int
import gleam/option.{None, Some}
import rocksky_api/context.{type Context}
import rocksky_api/drizzle/orm.{all, field, select}
import rocksky_api/drizzle/schema/feeds
import rocksky_api/error
import rocksky_api/log
import rocksky_api/node/redis
import rocksky_api/task.{type Task}

fn version_key(feed_uri: String) -> String {
  "feed:ver:" <> feed_uri
}

const scrobbles_version_key = "scrobbles:ver"

fn read_version(ctx: Context, key: String) -> Task(Int) {
  task.attempt_result(redis.get(ctx.redis, key))
  |> task.map(fn(v) {
    case v {
      Some(s) -> int.parse(s) |> result_unwrap(0)
      None -> 0
    }
  })
  |> task.rescue(fn(_) { task.ok(0) })
}

fn result_unwrap(r: Result(a, b), default: a) -> a {
  case r {
    Ok(v) -> v
    Error(_) -> default
  }
}

pub fn feed_version(ctx: Context, feed_uri: String) -> Task(Int) {
  read_version(ctx, version_key(feed_uri))
}

pub fn scrobbles_version(ctx: Context) -> Task(Int) {
  read_version(ctx, scrobbles_version_key)
}

pub fn bump_scrobbles_version(ctx: Context) -> Task(Nil) {
  task.attempt_result(redis.incr(ctx.redis, scrobbles_version_key))
  |> task.map(fn(_) { Nil })
  |> task.rescue(fn(e) {
    log.warn("bumpScrobblesVersion failed: " <> error.to_string(e))
    task.ok(Nil)
  })
}

pub fn bump_all_feed_versions(ctx: Context) -> Task(Nil) {
  {
    let table = feeds.table()
    use uris <- task.then(
      select(table, field("uri", feeds.uri(table))) |> all(ctx.db),
    )
    use _ <- task.map(
      task.parallel_map(uris, fn(uri) {
        task.attempt_result(redis.incr(ctx.redis, version_key(uri)))
      }),
    )
    Nil
  }
  |> task.rescue(fn(e) {
    log.warn("bumpAllFeedVersions failed: " <> error.to_string(e))
    task.ok(Nil)
  })
}
