import gleam/int
import gleam/list
import gleam/option.{None, Some}
import gleam/result
import gleam/string
import rocksky_api/context.{type Context}
import rocksky_api/drizzle/orm.{
  alias, all, and, asc, eq, field, from, ilike, is_null, limit, or, order_by,
  pair, reference, run, select, set, tuple_gt_subquery, update, where,
}
import rocksky_api/drizzle/schema/tracks as tr
import rocksky_api/error
import rocksky_api/lib/matching
import rocksky_api/log
import rocksky_api/node/process
import rocksky_api/schema/tracks
import rocksky_api/scripts/backfill
import rocksky_api/scripts/common
import rocksky_api/task

pub type Stats {
  Stats(processed: Int, mb: Int, isrc: Int, failed: Int)
}

fn filters(table, mb: Bool, isrc: Bool) {
  and([
    or([
      case mb {
        True -> is_null(tr.mb_id(table))
        False -> or([])
      },
      case isrc {
        True -> is_null(tr.isrc(table))
        False -> or([])
      },
    ]),
    scope(tr.artist(table), "BACKFILL_ARTIST"),
    scope(tr.album(table), "BACKFILL_ALBUM"),
  ])
}

fn scope(column, name) {
  case process.env(name) |> option.map(string.trim) {
    Some(value) if value != "" -> ilike(column, "%" <> value <> "%")
    _ -> and([])
  }
}

pub fn process_track(
  ctx: Context,
  track: tracks.Track,
  mb: Bool,
  isrc: Bool,
  delay: Int,
) {
  use request <- task.then(
    matching.request(
      track.title,
      track.artist,
      None,
      Some(track.album),
      None,
      None,
      track.mb_id,
      track.isrc,
      None,
    )
    |> task.from_result,
  )
  use candidate <- task.then(matching.match_track(ctx, request, None))
  use _ <- task.then(task.sleep(delay) |> task.attempt)
  let table = tr.table()
  case candidate {
    None -> task.ok(#(False, False))
    Some(candidate) -> {
      let mb_value = case mb && option.unwrap(track.mb_id, "") == "" {
        True -> candidate.identifiers.recording
        False -> None
      }
      let isrc_value = case isrc && option.unwrap(track.isrc, "") == "" {
        True -> candidate.identifiers.isrc
        False -> None
      }
      let assignments =
        list.flatten([
          case mb_value {
            Some(v) if v != "" -> [set(tr.mb_id(table), Some(v))]
            _ -> []
          },
          case isrc_value {
            Some(v) if v != "" -> [set(tr.isrc(table), Some(v))]
            _ -> []
          },
        ])
      case assignments {
        [] -> task.ok(#(False, False))
        _ ->
          update(table, assignments, eq(tr.id(table), track.id))
          |> run(ctx.db)
          |> task.map(fn(_) {
            #(
              option.unwrap(mb_value, "") != "",
              option.unwrap(isrc_value, "") != "",
            )
          })
          |> task.rescue(fn(e) {
            log.warn("Identifier update failed: " <> error.describe(e))
            task.ok(#(False, False))
          })
      }
    }
  }
}

fn pages(
  ctx: Context,
  cursor: option.Option(String),
  stats: Stats,
  target: Int,
  mb: Bool,
  isrc: Bool,
) {
  case stats.processed >= target {
    True -> task.ok(stats)
    False -> {
      let table = tr.table()
      let after = case cursor {
        None -> and([])
        Some(id) -> {
          let previous = alias(table, "previous_track")
          tuple_gt_subquery(
            [reference(tr.created_at(table)), reference(tr.id(table))],
            select(
              previous,
              pair(
                field("created", tr.created_at(previous)),
                field("id", tr.id(previous)),
              ),
            )
              |> where(eq(tr.id(previous), id)),
          )
        }
      }
      use rows <- task.then(
        from(table)
        |> where(and([filters(table, mb, isrc), after]))
        |> order_by([asc(tr.created_at(table)), asc(tr.id(table))])
        |> limit(int.min(
          backfill.number("BACKFILL_PAGE_SIZE", 500),
          target - stats.processed,
        ))
        |> all(ctx.db),
      )
      case rows {
        [] -> task.ok(stats)
        _ -> {
          use results <- task.then(
            task.parallel_map_limited(
              rows,
              backfill.positive_number("BACKFILL_CONCURRENCY", 4),
              fn(track) {
                process_track(
                  ctx,
                  track,
                  mb,
                  isrc,
                  backfill.number("BACKFILL_MATCHING_DELAY", 1100),
                )
                |> task.rescue(fn(e) {
                  log.warn(error.describe(e))
                  task.ok(#(False, False))
                })
              },
            ),
          )
          let stats =
            list.fold(results, stats, fn(acc, r) {
              Stats(
                acc.processed + 1,
                acc.mb
                  + case r.0 {
                  True -> 1
                  False -> 0
                },
                acc.isrc
                  + case r.1 {
                  True -> 1
                  False -> 0
                },
                acc.failed
                  + case r.0 || r.1 {
                  True -> 0
                  False -> 1
                },
              )
            })
          let cursor =
            list.last(rows)
            |> result.map(fn(t) { Some(t.id) })
            |> result.unwrap(cursor)
          log.info(
            "Processed "
            <> int.to_string(stats.processed)
            <> ", mbid "
            <> int.to_string(stats.mb)
            <> ", isrc "
            <> int.to_string(stats.isrc),
          )
          pages(ctx, cursor, stats, target, mb, isrc)
        }
      }
    }
  }
}

pub fn execute(ctx: Context, _args) {
  let only =
    process.env("BACKFILL_ONLY") |> option.unwrap("both") |> string.lowercase
  let mb = only == "both" || only == "mbid"
  let isrc = only == "both" || only == "isrc"
  case mb || isrc {
    False ->
      task.fail(error.InvalidRequest("BACKFILL_ONLY must be mbid, isrc or both"))
    True -> pages(ctx, None, Stats(0, 0, 0, 0), backfill.limit(), mb, isrc)
  }
}

pub fn main() {
  common.run(execute)
}
