import gleam/dict
import gleam/int
import gleam/javascript/promise
import gleam/json
import gleam/list
import gleam/option.{None, Some}
import rocksky_api/context.{type Context}
import rocksky_api/db/row
import rocksky_api/drizzle/orm.{
  all, and, eq, field, gte, lte, one, run, select, set, update, where,
}
import rocksky_api/drizzle/schema/import_jobs as jobs
import rocksky_api/drizzle/schema/scrobbles as sc
import rocksky_api/error
import rocksky_api/lib/agent
import rocksky_api/lib/auth
import rocksky_api/lib/track.{type Track}
import rocksky_api/log
import rocksky_api/node/js
import rocksky_api/node/map
import rocksky_api/nowplaying/service
import rocksky_api/task.{type Task}

pub type State {
  State(cancelled: map.Map(String, Bool), current: map.Map(String, String))
}

pub fn new() {
  State(map.new(), map.new())
}

pub fn cancel(state: State, id: String) {
  map.set(state.cancelled, id, True)
}

fn clear(state: State, id: String) {
  map.remove(state.cancelled, id)
  map.remove(state.current, id)
}

pub fn fail(ctx: Context, id: String, message: String) {
  let table = jobs.table()
  update(
    table,
    [
      set(jobs.status(table), "failed"),
      set(
        jobs.errors(table),
        Some(json.array([message], json.string) |> json.to_string),
      ),
      set(jobs.updated_at(table), row.from_unix_ms(js.now_ms())),
    ],
    eq(jobs.id(table), id),
  )
  |> run(ctx.db)
  |> task.map(fn(_) { Nil })
}

pub fn run_import(
  ctx: Context,
  state: State,
  id: String,
  tracks: List(Track),
  did: String,
) {
  use agent <- task.then(agent.create(ctx, did))
  case agent {
    None ->
      fail(
        ctx,
        id,
        "Authentication failed: ATProto session not found or expired. Try scrobbling a track first to refresh your session.",
      )
    Some(agent) -> {
      let cache = service.import_cache()
      run_with(ctx, state, id, tracks, did, fn(track) {
        service.scrobble_track(ctx, track, agent, did, True, Some(cache), None)
        |> task.map(fn(_) { Nil })
      })
    }
  }
}

pub fn run_with(
  ctx: Context,
  state: State,
  id: String,
  tracks: List(Track),
  did: String,
  process: fn(Track) -> Task(Nil),
) {
  use tracks <- task.then(prefilter(ctx, id, tracks, did))
  batches(ctx, state, id, tracks, process, 0, 0, [], 0)
}

fn prefilter(ctx: Context, id: String, tracks: List(Track), did: String) {
  use user <- task.then(auth.user_by_did(ctx, did))
  let times =
    list.filter_map(tracks, fn(t) {
      case t.timestamp {
        Some(time) if time > 0 -> Ok(time)
        _ -> Error(Nil)
      }
    })
  case user, times {
    Some(user), [first, ..rest] -> {
      let #(min, max) =
        list.fold(rest, #(first, first), fn(acc, time) {
          #(int.min(acc.0, time), int.max(acc.1, time))
        })
      let table = sc.table()
      use existing <- task.then(
        select(table, field("at", sc.timestamp(table)))
        |> where(
          and([
            eq(sc.user_id(table), Some(user.id)),
            gte(sc.timestamp(table), row.from_unix_ms(min * 1000)),
            lte(sc.timestamp(table), row.from_unix_ms(max * 1000)),
          ]),
        )
        |> all(ctx.db),
      )
      let seen =
        list.map(existing, fn(time) { #(row.to_unix_ms(time) / 1000, Nil) })
        |> dict.from_list
      let filtered =
        list.filter(tracks, fn(t) {
          !dict.has_key(seen, option.unwrap(t.timestamp, 0))
        })
      case list.length(filtered) == list.length(tracks) {
        True -> task.ok(filtered)
        False -> {
          let table = jobs.table()
          use _ <- task.map(
            update(
              table,
              [
                set(jobs.total(table), Some(list.length(filtered))),
                set(jobs.updated_at(table), row.from_unix_ms(js.now_ms())),
              ],
              eq(jobs.id(table), id),
            )
            |> run(ctx.db),
          )
          filtered
        }
      }
    }
    _, _ -> task.ok(tracks)
  }
}

fn progress(
  ctx: Context,
  id: String,
  processed: Int,
  failed: Int,
  errors: List(String),
  completed: Bool,
) {
  let table = jobs.table()
  update(
    table,
    [
      set(jobs.processed(table), Some(processed)),
      set(jobs.failed(table), Some(failed)),
      set(jobs.errors(table), case errors {
        [] -> None
        _ -> Some(json.array(errors, json.string) |> json.to_string)
      }),
      set(jobs.updated_at(table), row.from_unix_ms(js.now_ms())),
      ..case completed {
        True -> [set(jobs.status(table), "completed")]
        False -> []
      }
    ],
    eq(jobs.id(table), id),
  )
  |> run(ctx.db)
  |> task.map(fn(_) { Nil })
}

fn batches(
  ctx: Context,
  state: State,
  id: String,
  tracks: List(Track),
  process: fn(Track) -> Task(Nil),
  processed: Int,
  failed: Int,
  errors: List(String),
  batch_no: Int,
) {
  case tracks {
    [] -> {
      map.remove(state.current, id)
      progress(ctx, id, processed, failed, errors, True)
    }
    [first, ..] ->
      case map.get(state.cancelled, id) {
        Some(True) -> {
          clear(state, id)
          task.ok(Nil)
        }
        _ -> {
          map.set(state.current, id, first.title <> " — " <> first.artist)
          let batch = list.take(tracks, 3)
          use outcomes <- promise.await(
            promise.await_list(
              list.map(batch, fn(track) {
                process(track) |> promise.map(fn(outcome) { #(track, outcome) })
              }),
            ),
          )
          let #(processed, failed, errors) =
            list.fold(outcomes, #(processed, failed, errors), fn(acc, outcome) {
              case outcome.1 {
                Ok(_) -> #(acc.0 + 1, acc.1, acc.2)
                Error(e) -> {
                  let message =
                    outcome.0.title
                    <> " - "
                    <> outcome.0.artist
                    <> ": "
                    <> error.to_string(e)
                  log.warn("[import] Failed scrobble: " <> message)
                  #(acc.0, acc.1 + 1, case list.length(acc.2) < 50 {
                    True -> list.append(acc.2, [message])
                    False -> acc.2
                  })
                }
              }
            })
          use _ <- task.then(progress(ctx, id, processed, failed, errors, False))
          use status <- task.then(case batch_no % 5 == 0 {
            True -> {
              let table = jobs.table()
              select(table, field("status", jobs.status(table)))
              |> where(eq(jobs.id(table), id))
              |> one(ctx.db)
            }
            False -> task.ok(None)
          })
          case
            status == Some("cancelled")
            || map.get(state.cancelled, id) == Some(True)
          {
            True -> {
              clear(state, id)
              task.ok(Nil)
            }
            False -> {
              let rest = list.drop(tracks, 3)
              use _ <- promise.await(case rest {
                [] -> promise.resolve(Nil)
                _ -> task.sleep(300)
              })
              batches(
                ctx,
                state,
                id,
                rest,
                process,
                processed,
                failed,
                errors,
                batch_no + 1,
              )
            }
          }
        }
      }
  }
}
