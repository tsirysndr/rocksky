import gleam/int
import gleam/list
import gleam/option.{None, Some}
import gleam/result
import rocksky_api/context.{type Context}
import rocksky_api/drizzle/orm.{
  alias, all, and, asc, count, eq, field, from, is_null, limit, offset, order_by,
  pair, reference, required, select, tuple_gt_subquery, where,
}
import rocksky_api/drizzle/schema/albums as al
import rocksky_api/error
import rocksky_api/lib/discogs_enrichment as enrichment
import rocksky_api/lib/pg_connection_recovery as recovery
import rocksky_api/log
import rocksky_api/node/js
import rocksky_api/schema/albums
import rocksky_api/scripts/backfill
import rocksky_api/scripts/common
import rocksky_api/task

pub type Stats {
  Stats(processed: Int, matched: Int, missed: Int, skipped: Int, failed: Int)
}

pub fn pending_after(cursor: option.Option(String)) {
  let table = al.table()
  and([
    is_null(al.discogs_release_id(table)),
    case cursor {
      None -> and([])
      Some(id) -> {
        let previous = alias(table, "previous_album")
        tuple_gt_subquery(
          [reference(al.created_at(table)), reference(al.id(table))],
          select(
            previous,
            pair(
              field("created", al.created_at(previous)),
              field("id", al.id(previous)),
            ),
          )
            |> where(eq(al.id(previous), id)),
        )
      }
    },
  ])
}

fn enrich(ctx: Context, album: albums.Album, attempt: Int) {
  use response <- task.then(
    recovery.retry_pg_connection(fn() {
      enrichment.enrich_album_with_discogs(
        ctx,
        album.artist,
        album.title,
        Some(album.id),
      )
    }),
  )
  case response, attempt < 3 {
    enrichment.Unavailable, True -> {
      log.warn(
        "Discogs unavailable; retrying " <> album.id <> " after cooldown",
      )
      use _ <- task.then(task.sleep(60_000) |> task.attempt)
      enrich(ctx, album, attempt + 1)
    }
    _, _ -> task.ok(response)
  }
}

fn pages(
  ctx: Context,
  cursor: option.Option(String),
  start: Int,
  target: Int,
  stats: Stats,
  dry: Bool,
  spacing: Int,
) {
  case stats.processed >= target {
    True -> task.ok(stats)
    False -> {
      let table = al.table()
      use rows <- task.then(
        recovery.retry_pg_connection(fn() {
          from(table)
          |> where(pending_after(cursor))
          |> order_by([asc(al.created_at(table)), asc(al.id(table))])
          |> limit(200)
          |> offset(case cursor {
            None -> start
            _ -> 0
          })
          |> all(ctx.db)
        }),
      )
      case rows {
        [] -> task.ok(stats)
        _ -> {
          let rows = list.take(rows, target - stats.processed)
          use stats <- task.then(
            common.fold(rows, stats, fn(album, stats) {
              case dry {
                True -> {
                  log.info(
                    "[dry-run] would ask for "
                    <> album.artist
                    <> " - "
                    <> album.title,
                  )
                  task.ok(Stats(..stats, processed: stats.processed + 1))
                }
                False -> {
                  use response <- task.then(enrich(ctx, album, 1))
                  let stats = Stats(..stats, processed: stats.processed + 1)
                  let stats = case response {
                    enrichment.Matched(_) ->
                      Stats(..stats, matched: stats.matched + 1)
                    enrichment.Missed ->
                      Stats(..stats, missed: stats.missed + 1)
                    enrichment.Skipped ->
                      Stats(..stats, skipped: stats.skipped + 1)
                    enrichment.Unavailable ->
                      Stats(..stats, failed: stats.failed + 1)
                  }
                  use _ <- task.map(task.sleep(spacing) |> task.attempt)
                  stats
                }
              }
            }),
          )
          let cursor =
            list.last(rows)
            |> result.map(fn(a) { Some(a.id) })
            |> result.unwrap(cursor)
          log.info(
            "Processed "
            <> int.to_string(stats.processed)
            <> ", matched "
            <> int.to_string(stats.matched)
            <> ", unavailable "
            <> int.to_string(stats.failed),
          )
          pages(ctx, cursor, start, target, stats, dry, spacing)
        }
      }
    }
  }
}

pub fn parse_offset(args: List(String)) {
  case args {
    [] -> Ok(0)
    ["--cursor", value] ->
      case js.regex_test("^[0-9]+$", value) {
        True ->
          int.parse(value)
          |> result.map_error(fn(_) {
            error.InvalidRequest(
              "--cursor must be a non-negative integer offset",
            )
          })
        False ->
          Error(error.InvalidRequest(
            "--cursor must be a non-negative integer offset",
          ))
      }
    _ ->
      Error(error.InvalidRequest("Usage: backfill_discogs [--cursor <offset>]"))
  }
}

pub fn execute(ctx: Context, args: List(String)) {
  use start <- task.then(parse_offset(args) |> task.from_result)
  case ctx.env.discogs_enrichment_enabled {
    False -> {
      log.info("Discogs enrichment is disabled")
      task.ok(Stats(0, 0, 0, 0, 0))
    }
    True -> {
      let table = al.table()
      use total <- task.then(
        recovery.retry_pg_connection(fn() {
          select(table, field("count", count()))
          |> where(pending_after(None))
          |> required(ctx.db, "Missing album count")
        }),
      )
      let per_minute =
        int.max(backfill.number("BACKFILL_ALBUMS_PER_MINUTE", 18), 1)
      pages(
        ctx,
        None,
        start,
        int.min(int.max(total - start, 0), backfill.limit()),
        Stats(0, 0, 0, 0, 0),
        backfill.dry_run(),
        { 60_000 + per_minute - 1 } / per_minute,
      )
    }
  }
}

pub fn main() {
  common.run(execute)
}
