import gleam/dict
import gleam/dynamic/decode
import gleam/list
import gleam/option.{None, Some}
import gleam/string
import rocksky_api/atproto/agent as atp
import rocksky_api/context.{type Context}
import rocksky_api/drizzle/orm.{
  alias, all, and, distinct, eq, eq_columns, exists, field, from, inner_join,
  is_null, like_optional, not_exists, nullable, or, pair, run, select, set,
  update, where,
}
import rocksky_api/drizzle/schema/scrobbles as sc
import rocksky_api/drizzle/schema/tracks as tr
import rocksky_api/drizzle/schema/user_tracks as ut
import rocksky_api/drizzle/schema/users as us
import rocksky_api/error
import rocksky_api/lib/extract_pds
import rocksky_api/log
import rocksky_api/node/crypto
import rocksky_api/node/process
import rocksky_api/scripts/backfill
import rocksky_api/scripts/common
import rocksky_api/task

pub fn track_hash(title: String, artist: String, album: String) {
  crypto.sha256_hex(string.lowercase(title <> " - " <> artist <> " - " <> album))
}

pub fn apply_uri(ctx: Context, hash: String, uri: String, dry: Bool) {
  case dry {
    True -> task.ok(1)
    False -> {
      let table = tr.table()
      let other = alias(table, "other_track")
      update(
        table,
        [set(tr.uri(table), Some(uri))],
        and([
          eq(tr.sha256(table), hash),
          is_null(tr.uri(table)),
          not_exists(from(other) |> where(eq(tr.uri(other), Some(uri)))),
        ]),
      )
      |> run(ctx.db)
      |> task.rescue(fn(e) {
        log.warn("Failed to set " <> uri <> ": " <> error.describe(e))
        task.ok(0)
      })
    }
  }
}

pub fn from_user_tracks(ctx: Context, dry: Bool) {
  let tracks = tr.table()
  let links = ut.table()
  let other = alias(tracks, "other_track")
  use rows <- task.then(
    select(
      tracks,
      pair(field("hash", tr.sha256(tracks)), field("uri", ut.uri(links))),
    )
    |> inner_join(links, eq_columns(ut.track_id(links), tr.id(tracks)))
    |> where(
      and([
        is_null(tr.uri(tracks)),
        like_optional(ut.uri(links), "at://%/app.rocksky.song/%"),
        not_exists(
          from(other)
          |> where(eq_columns(tr.uri(other), ut.uri(links))),
        ),
      ]),
    )
    |> all(ctx.db),
  )
  common.fold(rows, 0, fn(r, total) {
    use changed <- task.map(case r.1 {
      Some(uri) -> apply_uri(ctx, r.0, uri, dry)
      None -> task.ok(0)
    })
    total + changed
  })
}

pub fn candidate_dids(ctx: Context, everyone: Bool) {
  let users = us.table()
  let tracks = tr.table()
  let scrobbles = sc.table()
  let links = ut.table()
  select(users, field("did", us.did(users)))
  |> where(case everyone {
    True -> and([])
    False ->
      or([
        exists(
          from(scrobbles)
          |> inner_join(
            tracks,
            eq_columns(sc.track_id(scrobbles), nullable(tr.id(tracks))),
          )
          |> where(
            and([
              eq_columns(sc.user_id(scrobbles), nullable(us.id(users))),
              is_null(tr.uri(tracks)),
            ]),
          ),
        ),
        exists(
          from(links)
          |> inner_join(tracks, eq_columns(ut.track_id(links), tr.id(tracks)))
          |> where(
            and([
              eq_columns(ut.user_id(links), us.id(users)),
              is_null(tr.uri(tracks)),
            ]),
          ),
        ),
      ])
  })
  |> distinct
  |> all(ctx.db)
}

fn song_decoder() {
  use title <- decode.field("title", decode.string)
  use artist <- decode.field("artist", decode.string)
  use album <- decode.optional_field("album", "", decode.string)
  decode.success(#(title, artist, album))
}

pub fn collect(agent: atp.Agent, did: String, wanted, cursor, found) {
  let work = {
    use page <- task.then(
      atp.list_records(agent, did, "app.rocksky.song", 100, cursor, False)
      |> task.attempt_result,
    )
    let found =
      list.fold(page.records, found, fn(acc, r) {
        case decode.run(r.value, song_decoder()) {
          Ok(#(title, artist, album)) if title != "" && artist != "" -> {
            let hash = track_hash(title, artist, album)
            case dict.has_key(wanted, hash) && !dict.has_key(acc, hash) {
              True -> dict.insert(acc, hash, r.uri)
              False -> acc
            }
          }
          _ -> acc
        }
      })
    case page.records, page.cursor {
      [], _ | _, None -> task.ok(found)
      _, Some(cursor) -> collect(agent, did, wanted, Some(cursor), found)
    }
  }
  work
  |> task.rescue(fn(e) {
    log.warn("PDS crawl failed for " <> did <> ": " <> error.describe(e))
    task.ok(found)
  })
}

pub fn execute(ctx: Context, _args) {
  let dry = option.unwrap(process.env("BACKFILL_URI_DRY_RUN"), "") == "1"
  use from_links <- task.then(from_user_tracks(ctx, dry))
  let tracks = tr.table()
  use wanted <- task.then(
    select(
      tracks,
      pair(field("hash", tr.sha256(tracks)), field("id", tr.id(tracks))),
    )
    |> where(is_null(tr.uri(tracks)))
    |> all(ctx.db),
  )
  let wanted = dict.from_list(wanted)
  case dict.size(wanted) == 0 {
    True -> task.ok(from_links)
    False -> {
      use dids <- task.then(candidate_dids(
        ctx,
        option.unwrap(process.env("BACKFILL_URI_ALL_USERS"), "") == "1",
      ))
      use results <- task.then(
        task.parallel_map_limited(
          dids,
          backfill.positive_number("BACKFILL_URI_CONCURRENCY", 4),
          fn(did) {
            {
              use pds <- task.then(extract_pds.from_did(
                ctx.env.plc_directory_url,
                did,
              ))
              collect(atp.atp_agent(pds), did, wanted, None, dict.new())
            }
            |> task.rescue(fn(e) {
              log.warn(error.describe(e))
              task.ok(dict.new())
            })
          },
        ),
      )
      let found =
        list.fold(results, dict.new(), fn(acc, next) {
          dict.fold(next, acc, fn(acc, hash, uri) {
            case dict.has_key(acc, hash) {
              True -> acc
              False -> dict.insert(acc, hash, uri)
            }
          })
        })
      common.fold(dict.to_list(found), from_links, fn(r, total) {
        use changed <- task.map(apply_uri(ctx, r.0, r.1, dry))
        total + changed
      })
    }
  }
}

pub fn main() {
  common.run(execute)
}
