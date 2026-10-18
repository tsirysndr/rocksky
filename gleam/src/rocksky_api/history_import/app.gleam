import gleam/int
import gleam/javascript/promise
import gleam/json
import gleam/list
import gleam/option.{None, Some}
import gleam/result
import rocksky_api/context.{type Context}
import rocksky_api/db/row
import rocksky_api/drizzle/orm.{
  all, desc, eq, from, insert, limit, offset, one, order_by, returning_one, run,
  set, update, where,
}
import rocksky_api/drizzle/schema/import_jobs as jobs
import rocksky_api/error
import rocksky_api/history_import/parse
import rocksky_api/history_import/worker.{type State}
import rocksky_api/lib/auth
import rocksky_api/lib/respond
import rocksky_api/lib/track.{type Track}
import rocksky_api/lib/verify_token
import rocksky_api/log
import rocksky_api/node/hono
import rocksky_api/node/js
import rocksky_api/node/map
import rocksky_api/schema/import_jobs.{type ImportJob}
import rocksky_api/task

fn latest(ctx: Context, id: String) {
  let table = jobs.table()
  from(table)
  |> where(eq(jobs.user_id(table), Some(id)))
  |> order_by([desc(jobs.created_at(table))])
  |> one(ctx.db)
}

fn user(ctx: Context, c: hono.Context) {
  auth.user(ctx, c)
  |> task.rescue(fn(_) { task.fail(error.Unauthorized("Unauthorized")) })
}

fn failure(c: hono.Context, status: Int, message: String) {
  hono.json(c, json.object([#("error", json.string(message))]), status)
}

fn job_json(job: ImportJob, state: State) {
  json.object([
    #("id", json.string(job.id)),
    #("userId", json.nullable(job.user_id, json.string)),
    #("type", json.string(job.type_)),
    #("status", json.string(job.status)),
    #("total", json.nullable(job.total, json.int)),
    #("processed", json.nullable(job.processed, json.int)),
    #("failed", json.nullable(job.failed, json.int)),
    #("errors", json.nullable(job.errors, json.string)),
    #("createdAt", json.string(row.iso8601(job.created_at))),
    #("updatedAt", json.string(row.iso8601(job.updated_at))),
    #("xataVersion", json.nullable(job.xata_version, json.int)),
    #(
      "currentTrack",
      json.nullable(map.get(state.current, job.id), json.string),
    ),
  ])
}

fn number(c: hono.Context, name: String, default: Int) {
  case
    hono.query(c, name)
    |> option.then(fn(v) { int.parse(v) |> option.from_result })
  {
    None | Some(0) -> default
    Some(v) -> v
  }
}

pub fn app(ctx: Context) {
  let state = worker.new()
  app_with_runner(ctx, state, fn(id, tracks, did) {
    task.background(worker.run_import(ctx, state, id, tracks, did), fn(e) {
      log.error(
        "[import] Unhandled error in job " <> id <> ": " <> error.describe(e),
      )
      task.background(
        worker.fail(ctx, id, "Import crashed: " <> error.to_string(e)),
        fn(e) { log.error(error.describe(e)) },
      )
    })
  })
}

pub fn app_with_runner(
  ctx: Context,
  state: State,
  start: fn(String, List(Track), String) -> Nil,
) {
  hono.new()
  |> hono.post("/upload", fn(c) {
    let work = {
      use user <- task.then(user(ctx, c))
      use previous <- task.then(latest(ctx, user.id))
      case previous {
        Some(job) if job.status == "running" ->
          case js.now_ms() - row.to_unix_ms(job.updated_at) < 1_800_000 {
            True -> task.ok(failure(c, 409, "An import is already running"))
            False -> {
              let table = jobs.table()
              use _ <- task.then(
                update(
                  table,
                  [
                    set(jobs.status(table), "failed"),
                    set(jobs.updated_at(table), row.from_unix_ms(js.now_ms())),
                  ],
                  eq(jobs.id(table), job.id),
                )
                |> run(ctx.db),
              )
              upload(ctx, c, user.id, user.did, start)
            }
          }
        _ -> upload(ctx, c, user.id, user.did, start)
      }
    }
    respond.with(c, work, fn(r) { r })
  })
  |> hono.get("/status", fn(c) {
    let work = {
      use user <- task.then(user(ctx, c))
      use job <- task.map(latest(ctx, user.id))
      json.nullable(job, job_json(_, state))
    }
    respond.json(c, work)
  })
  |> hono.get("/jobs", fn(c) {
    let work = {
      use user <- task.then(user(ctx, c))
      let table = jobs.table()
      from(table)
      |> where(eq(jobs.user_id(table), Some(user.id)))
      |> order_by([desc(jobs.created_at(table))])
      |> limit(int.min(number(c, "size", 20), 100))
      |> offset(number(c, "offset", 0))
      |> all(ctx.db)
      |> task.map(json.array(_, import_jobs.to_json))
    }
    respond.json(c, work)
  })
  |> hono.post("/cancel", fn(c) {
    let work = {
      use user <- task.then(user(ctx, c))
      use job <- task.then(latest(ctx, user.id))
      case job {
        Some(job) if job.status == "running" -> {
          let table = jobs.table()
          use _ <- task.map(
            update(
              table,
              [
                set(jobs.status(table), "cancelled"),
                set(jobs.updated_at(table), row.from_unix_ms(js.now_ms())),
              ],
              eq(jobs.id(table), job.id),
            )
            |> run(ctx.db),
          )
          worker.cancel(state, job.id)
          hono.json(c, json.object([#("ok", json.bool(True))]), 200)
        }
        _ -> task.ok(failure(c, 400, "No running import to cancel"))
      }
    }
    respond.with(c, work, fn(r) { r })
  })
  |> hono.get("/events", fn(c) {
    let work = {
      use did <- task.then(case hono.query(c, "token") {
        None | Some("") | Some("null") ->
          task.fail(error.Unauthorized("Unauthorized"))
        Some(token) ->
          verify_token.verify_did(ctx.env, ctx.db, token)
          |> task.rescue(fn(_) { task.fail(error.Unauthorized("Unauthorized")) })
      })
      use user <- task.map(auth.require_user(ctx, did))
      hono.stream_sse(c, fn(stream) {
        pulse(ctx, state, user.id, stream, js.now_ms() + 7_200_000)
        |> promise.map(fn(outcome) {
          case outcome {
            Ok(_) -> Nil
            Error(e) -> log.error(error.describe(e))
          }
        })
      })
    }
    respond.with(c, work, fn(r) { r })
  })
}

fn upload(
  ctx: Context,
  c: hono.Context,
  user_id: String,
  did: String,
  start: fn(String, List(Track), String) -> Nil,
) {
  use form <- promise.await(hono.form_data(c))
  case form {
    Error(_) -> task.ok(failure(c, 400, "Invalid multipart form data"))
    Ok(form) ->
      case hono.form_file(form, "file"), hono.form_string(form, "type") {
        Some(file), Some(type_) if type_ == "lastfm" || type_ == "spotify" -> {
          use text <- task.then(hono.file_text(file) |> task.attempt_result)
          let tracks = case type_ {
            "lastfm" -> Ok(parse.lastfm_csv(text))
            _ ->
              parse.spotify_json(text)
              |> result.map_error(fn(_) { "Failed to parse file: Invalid JSON" })
          }
          case tracks {
            Error(message) -> task.ok(failure(c, 400, message))
            Ok([]) ->
              task.ok(failure(c, 400, "No valid scrobbles found in file"))
            Ok(tracks) -> {
              let tracks =
                list.sort(tracks, fn(a, b) {
                  int.compare(
                    option.unwrap(a.timestamp, 0),
                    option.unwrap(b.timestamp, 0),
                  )
                })
              let table = jobs.table()
              use job <- task.map(
                insert(table, [
                  set(jobs.user_id(table), Some(user_id)),
                  set(jobs.type_(table), type_),
                  set(jobs.status(table), "running"),
                  set(jobs.total(table), Some(list.length(tracks))),
                  set(jobs.processed(table), Some(0)),
                  set(jobs.failed(table), Some(0)),
                ])
                |> returning_one(ctx.db, "Import job insert failed"),
              )
              start(job.id, tracks, did)
              hono.json(c, import_jobs.to_json(job), 200)
            }
          }
        }
        _, _ -> task.ok(failure(c, 400, "Missing file or invalid type"))
      }
  }
}

fn pulse(
  ctx: Context,
  state: State,
  user_id: String,
  stream: hono.Stream,
  deadline: Int,
) {
  case js.now_ms() >= deadline || hono.stream_closed(stream) {
    True -> task.ok(Nil)
    False -> {
      use job <- task.then(latest(ctx, user_id))
      use _ <- task.then(
        hono.write_sse(
          stream,
          "progress",
          json.nullable(job, job_json(_, state)) |> json.to_string,
        )
        |> task.attempt_result,
      )
      case job {
        None -> task.ok(Nil)
        Some(job)
          if job.status == "completed"
          || job.status == "failed"
          || job.status == "cancelled"
        -> task.ok(Nil)
        _ -> {
          use _ <- promise.await(hono.stream_sleep(stream, 1000))
          pulse(ctx, state, user_id, stream, deadline)
        }
      }
    }
  }
}
