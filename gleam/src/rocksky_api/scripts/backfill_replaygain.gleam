import gleam/bit_array
import gleam/dynamic/decode
import gleam/int
import gleam/list
import gleam/option.{None, Some}
import gleam/result
import rocksky_api/context.{type Context}
import rocksky_api/drizzle/orm.{
  all, and, asc, eq, from, gt, is_null, limit, order_by, run, set, update, where,
}
import rocksky_api/drizzle/schema/user_uploads as uu
import rocksky_api/error
import rocksky_api/log
import rocksky_api/node/music_metadata
import rocksky_api/node/s3
import rocksky_api/schema/user_uploads
import rocksky_api/scripts/backfill
import rocksky_api/scripts/common
import rocksky_api/task
import rocksky_api/uploads/replaygain

pub type Stats {
  Stats(scanned: Int, tagged: Int, skipped: Int, failed: Int)
}

pub fn process_upload(
  ctx: Context,
  client: s3.Client,
  upload: user_uploads.UserUpload,
  dry: Bool,
) {
  let ext = backfill.extension(upload.mime_type)
  case replaygain.supported(ext) {
    False -> task.ok(False)
    True -> {
      use bytes <- task.then(
        s3.get_object(client, ctx.env.s3_bucket_name, upload.r2_key)
        |> task.attempt_result,
      )
      use metadata <- task.then(
        music_metadata.parse(bytes, upload.mime_type) |> task.attempt_result,
      )
      let tagged =
        decode.run(
          metadata,
          decode.at(["common", "replaygain_track_gain", "dB"], decode.float),
        )
        |> result.is_ok
      case tagged, dry {
        True, _ -> task.ok(False)
        False, True -> {
          log.info("[dry-run] would tag " <> upload.r2_key)
          task.ok(True)
        }
        False, False -> {
          use tagged <- task.then(replaygain.ensure_replay_gain(bytes, ext))
          case tagged == bytes {
            True ->
              task.fail(error.Message("analysis failed: " <> upload.r2_key))
            False -> {
              use _ <- task.then(
                s3.put_object_metadata(
                  client,
                  ctx.env.s3_bucket_name,
                  upload.r2_key,
                  tagged,
                  upload.mime_type,
                  [],
                )
                |> task.attempt_result,
              )
              let table = uu.table()
              use _ <- task.map(
                update(
                  table,
                  [set(uu.file_size(table), bit_array.byte_size(tagged))],
                  eq(uu.id(table), upload.id),
                )
                |> run(ctx.db),
              )
              True
            }
          }
        }
      }
    }
  }
}

fn pages(
  ctx: Context,
  client: s3.Client,
  cursor: String,
  stats: Stats,
  target: Int,
  size: Int,
  dry: Bool,
) {
  case stats.tagged >= target {
    True -> task.ok(stats)
    False -> {
      let table = uu.table()
      use rows <- task.then(
        from(table)
        |> where(
          and([
            gt(uu.id(table), cursor),
            is_null(uu.storage_provider_id(table)),
            case backfill.user_id() {
              None -> and([])
              Some(id) -> eq(uu.user_id(table), id)
            },
          ]),
        )
        |> order_by([asc(uu.id(table))])
        |> limit(size)
        |> all(ctx.db),
      )
      case rows {
        [] -> task.ok(stats)
        _ -> {
          use stats <- task.then(
            common.fold(rows, stats, fn(upload, stats) {
              case stats.tagged >= target {
                True -> task.ok(stats)
                False -> {
                  process_upload(ctx, client, upload, dry)
                  |> task.map(fn(tagged) {
                    case tagged {
                      True ->
                        Stats(
                          ..stats,
                          scanned: stats.scanned + 1,
                          tagged: stats.tagged + 1,
                        )
                      False ->
                        Stats(
                          ..stats,
                          scanned: stats.scanned + 1,
                          skipped: stats.skipped + 1,
                        )
                    }
                  })
                  |> task.rescue(fn(e) {
                    log.warn(error.describe(e))
                    task.ok(
                      Stats(
                        ..stats,
                        scanned: stats.scanned + 1,
                        failed: stats.failed + 1,
                      ),
                    )
                  })
                }
              }
            }),
          )
          let cursor =
            list.last(rows)
            |> result.map(fn(u) { u.id })
            |> result.unwrap(cursor)
          log.info(
            "scanned="
            <> int.to_string(stats.scanned)
            <> " tagged="
            <> int.to_string(stats.tagged)
            <> " failed="
            <> int.to_string(stats.failed),
          )
          pages(ctx, client, cursor, stats, target, size, dry)
        }
      }
    }
  }
}

pub fn execute(ctx: Context, _args) {
  let client =
    s3.client(
      ctx.env.s3_region,
      ctx.env.s3_endpoint,
      ctx.env.s3_access_key_id,
      ctx.env.s3_secret_access_key,
    )
  pages(
    ctx,
    client,
    "",
    Stats(0, 0, 0, 0),
    backfill.limit(),
    backfill.number("BACKFILL_PAGE_SIZE", 100),
    backfill.dry_run(),
  )
}

pub fn main() {
  common.run(execute)
}
