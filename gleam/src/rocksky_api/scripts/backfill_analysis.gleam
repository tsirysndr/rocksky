import gleam/dynamic/decode
import gleam/int
import gleam/list
import gleam/option.{None, Some}
import rocksky_api/context.{type Context}
import rocksky_api/drizzle/orm.{
  all, all_columns, and, asc, count_distinct, eq, eq_columns, field, gt,
  inner_join, is_null, limit, or, order_by, required, select, where,
}
import rocksky_api/drizzle/schema/tracks as tr
import rocksky_api/drizzle/schema/user_uploads as uu
import rocksky_api/error
import rocksky_api/lib/query_cache
import rocksky_api/log
import rocksky_api/node/audio_analysis
import rocksky_api/node/js
import rocksky_api/node/process
import rocksky_api/node/s3
import rocksky_api/schema/user_uploads
import rocksky_api/scripts/backfill
import rocksky_api/scripts/common
import rocksky_api/storage/app as storage
import rocksky_api/task
import rocksky_api/uploads/analysis

pub type Stats {
  Stats(
    processed: Int,
    filled: Int,
    failed: Int,
    download_failed: Int,
    checked_binding: Bool,
  )
}

pub type BatchResult {
  BatchResult(
    id: option.Option(String),
    ok: Bool,
    analysis: option.Option(analysis.Analysis),
  )
}

fn result_decoder() {
  use id <- decode.optional_field("id", None, decode.optional(decode.string))
  use ok <- decode.field("ok", decode.bool)
  use analysis <- decode.optional_field(
    "analysis",
    None,
    decode.optional({
      use key <- decode.optional_field(
        "key",
        None,
        decode.optional(decode.string),
      )
      use bpm <- decode.optional_field(
        "bpm",
        None,
        decode.optional(decode.float),
      )
      // Required field distinguishes a null fingerprint from an obsolete binding.
      use fingerprint <- decode.field(
        "fingerprint",
        decode.optional(decode.string),
      )
      decode.success(analysis.Analysis(key, bpm, fingerprint))
    }),
  )
  decode.success(BatchResult(id, ok, analysis))
}

fn filters(tracks, uploads) {
  and([
    case option.unwrap(process.env("BACKFILL_ONLY"), "") == "fingerprint" {
      True -> is_null(tr.acoustid_fingerprint(tracks))
      False ->
        or([
          is_null(tr.key(tracks)),
          is_null(tr.bpm(tracks)),
          is_null(tr.acoustid_fingerprint(tracks)),
        ])
    },
    case backfill.user_id() {
      None -> and([])
      Some(user) -> eq(uu.user_id(uploads), user)
    },
  ])
}

/// Advance only through consumed uploads, including duplicate track rows.
pub fn take_batch(
  rows: List(user_uploads.UserUpload),
  seen: List(String),
  capacity: Int,
  cursor: String,
  batch: List(user_uploads.UserUpload),
) {
  case rows, capacity {
    [], _ -> #(list.reverse(batch), seen, cursor)
    _, 0 -> #(list.reverse(batch), seen, cursor)
    [row, ..rest], _ ->
      case list.contains(seen, row.track_id) {
        True -> take_batch(rest, seen, capacity, row.id, batch)
        False ->
          take_batch(rest, [row.track_id, ..seen], capacity - 1, row.id, [
            row,
            ..batch
          ])
      }
  }
}

fn pages(
  ctx: Context,
  module: audio_analysis.Module,
  cache,
  cursor: String,
  seen: List(String),
  stats: Stats,
  target: Int,
  size: Int,
  dry: Bool,
) {
  case stats.processed >= target {
    True -> task.ok(stats)
    False -> {
      let uploads = uu.table()
      let tracks = tr.table()
      use rows <- task.then(
        select(uploads, all_columns(uploads))
        |> inner_join(tracks, eq_columns(uu.track_id(uploads), tr.id(tracks)))
        |> where(and([gt(uu.id(uploads), cursor), filters(tracks, uploads)]))
        |> order_by([asc(uu.id(uploads))])
        |> limit(size * 4)
        |> all(ctx.db),
      )
      case rows {
        [] -> task.ok(stats)
        _ -> {
          let #(batch, seen, cursor) =
            take_batch(
              rows,
              seen,
              int.min(size, target - stats.processed),
              cursor,
              [],
            )
          use downloads <- task.then(
            task.parallel_map(batch, fn(upload) {
              let key = case upload.storage_provider_id {
                Some(id) if id != "" -> upload.user_id <> ":" <> id
                _ -> "managed"
              }
              let work = {
                use storage <- task.then(
                  query_cache.get(cache, key, fn() {
                    storage.resolve_storage_client(
                      ctx,
                      upload.user_id,
                      upload.storage_provider_id,
                    )
                  }),
                )
                use bytes <- task.map(
                  s3.get_object_timeout(
                    storage.client,
                    storage.bucket,
                    upload.r2_key,
                    backfill.number("BACKFILL_DOWNLOAD_TIMEOUT_MS", 90_000),
                  )
                  |> task.attempt_result,
                )
                Some(audio_analysis.BatchItem(
                  upload.track_id,
                  bytes,
                  backfill.extension(upload.mime_type),
                ))
              }
              work
              |> task.rescue(fn(e) {
                log.warn(
                  "Download failed "
                  <> upload.r2_key
                  <> ": "
                  <> error.describe(e),
                )
                task.ok(None)
              })
            }),
          )
          let items =
            list.filter_map(downloads, fn(v) { option.to_result(v, Nil) })
          let stats =
            Stats(
              ..stats,
              download_failed: stats.download_failed
                + list.length(batch)
                - list.length(items),
            )
          use stats <- task.then(case items {
            [] -> task.ok(stats)
            _ -> {
              use data <- task.then(
                audio_analysis.analyze_batch(module, items, fn(progress) {
                  log.info(js.stringify(progress))
                })
                |> task.attempt_result,
              )
              use results <- task.then(
                decode.run(data, decode.list(result_decoder()))
                |> error.decode(
                  "Audio analysis results (rebuild the native binding if fingerprint is absent)",
                  _,
                )
                |> task.from_result,
              )
              common.fold(results, stats, fn(result, stats) {
                let stats = Stats(..stats, processed: stats.processed + 1)
                case result.ok, result.id, result.analysis {
                  True, Some(id), Some(analysis)
                    if analysis != analysis.Analysis(None, None, None)
                  -> {
                    use _ <- task.map(case dry {
                      True -> task.ok(Nil)
                      False -> analysis.store_track_analysis(ctx, id, analysis)
                    })
                    Stats(
                      ..stats,
                      filled: stats.filled + 1,
                      checked_binding: True,
                    )
                  }
                  _, _, _ -> task.ok(Stats(..stats, failed: stats.failed + 1))
                }
              })
            }
          })
          log.info(
            "Analyzed "
            <> int.to_string(stats.processed)
            <> ", filled "
            <> int.to_string(stats.filled)
            <> ", download failures "
            <> int.to_string(stats.download_failed),
          )
          pages(ctx, module, cache, cursor, seen, stats, target, size, dry)
        }
      }
    }
  }
}

pub fn execute(ctx: Context, _args) {
  use module <- task.then(audio_analysis.load() |> task.attempt_result)
  let uploads = uu.table()
  let tracks = tr.table()
  use total <- task.then(
    select(uploads, field("count", count_distinct(tr.id(tracks))))
    |> inner_join(tracks, eq_columns(uu.track_id(uploads), tr.id(tracks)))
    |> where(filters(tracks, uploads))
    |> required(ctx.db, "Missing upload count"),
  )
  pages(
    ctx,
    module,
    query_cache.new(86_400_000, 100_000),
    "",
    [],
    Stats(0, 0, 0, 0, False),
    int.min(total, backfill.limit()),
    backfill.positive_number("BACKFILL_BATCH_SIZE", 8),
    backfill.dry_run(),
  )
}

pub fn main() {
  common.run(execute)
}
