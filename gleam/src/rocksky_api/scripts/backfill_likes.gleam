import gleam/dynamic.{type Dynamic}
import gleam/dynamic/decode
import gleam/json
import gleam/list
import gleam/option.{None, Some}
import gleam/result
import gleam/string
import rocksky_api/atproto/agent as atp
import rocksky_api/atproto/identity
import rocksky_api/context.{type Context}
import rocksky_api/db/row
import rocksky_api/drizzle/orm.{
  and, eq, field, from, insert, on_conflict_do_nothing, one, returning, select,
  set, where,
}
import rocksky_api/drizzle/schema/loved_tracks as lt
import rocksky_api/drizzle/schema/tracks as tr
import rocksky_api/drizzle/schema/user_tracks as ut
import rocksky_api/drizzle/schema/users as us
import rocksky_api/error
import rocksky_api/lib/bsky_profile
import rocksky_api/lib/query_cache
import rocksky_api/log
import rocksky_api/node/crypto
import rocksky_api/node/js
import rocksky_api/node/nats
import rocksky_api/scripts/common
import rocksky_api/task

pub type Counts {
  Counts(created: Int, skipped: Int, unresolved: Int)
}

pub fn split_uri(uri: String) {
  case string.replace(uri, "at://", "") |> string.split("/") {
    [repo, collection, rkey, ..]
      if repo != "" && collection != "" && rkey != ""
    -> Some(#(repo, collection, rkey))
    _ -> None
  }
}

fn text(value: Dynamic, key: String) {
  decode.run(value, decode.field(key, decode.string, decode.success))
  |> result.unwrap("")
}

pub fn ensure_user(
  ctx: Context,
  did: String,
  handle: String,
  agent: atp.Agent,
) {
  let users = us.table()
  use existing <- task.then(
    from(users) |> where(eq(us.did(users), did)) |> one(ctx.db),
  )
  case existing {
    Some(user) -> task.ok(user)
    None -> {
      use profile <- task.then(bsky_profile.fetch(
        ctx.env.bsky_appview_url,
        did,
        Some(agent),
      ))
      use user <- task.map(
        insert(users, [
          set(us.did(users), did),
          set(us.handle(users), handle),
          set(us.display_name(users), profile.display_name),
          set(us.avatar(users), option.unwrap(profile.avatar, "")),
        ])
        |> returning(ctx.db)
        |> task.map(fn(rows) { list.first(rows) |> option.from_result })
        |> task.require_task("User could not be created"),
      )
      nats.publish(
        ctx.nc,
        "rocksky.user",
        json.object([
          #("xata_id", json.string(user.id)),
          #("did", json.string(user.did)),
          #("handle", json.string(user.handle)),
          #("display_name", json.nullable(user.display_name, json.string)),
          #("avatar", json.string(user.avatar)),
          #("xata_createdat", json.string(row.iso8601(user.created_at))),
          #("xata_updatedat", json.string(row.iso8601(user.updated_at))),
          #("xata_version", json.int(1)),
        ])
          |> json.to_string,
      )
      user
    }
  }
}

fn song_hash(ctx: Context, uri: String) {
  let work = case split_uri(uri) {
    None -> task.ok(None)
    Some(#(repo, collection, rkey)) -> {
      use identity <- task.then(
        identity.resolve_atproto_data(ctx.resolver, repo) |> task.attempt_result,
      )
      use record <- task.map(
        atp.get_record(atp.atp_agent(identity.pds), repo, collection, rkey)
        |> task.attempt_result,
      )
      let title = text(record.value, "title")
      let artist = text(record.value, "artist")
      let album = text(record.value, "album")
      case title != "" && artist != "" && album != "" {
        True ->
          Some(
            crypto.sha256_hex(string.lowercase(
              title <> " - " <> artist <> " - " <> album,
            )),
          )
        False -> None
      }
    }
  }
  work
  |> task.rescue(fn(e) {
    log.warn("Could not fetch " <> uri <> ": " <> error.describe(e))
    task.ok(None)
  })
}

pub fn resolve_track(ctx: Context, uri: String, cache) {
  let tracks = tr.table()
  use direct <- task.then(
    select(tracks, field("id", tr.id(tracks)))
    |> where(eq(tr.uri(tracks), Some(uri)))
    |> one(ctx.db),
  )
  case direct {
    Some(_) -> task.ok(direct)
    None -> {
      let links = ut.table()
      use linked <- task.then(
        select(links, field("id", ut.track_id(links)))
        |> where(eq(ut.uri(links), Some(uri)))
        |> one(ctx.db),
      )
      case linked {
        Some(_) -> task.ok(linked)
        None -> {
          use hash <- task.then(
            query_cache.get(cache, uri, fn() { song_hash(ctx, uri) }),
          )
          case hash {
            None -> task.ok(None)
            Some(hash) ->
              select(tracks, field("id", tr.id(tracks)))
              |> where(eq(tr.sha256(tracks), hash))
              |> one(ctx.db)
          }
        }
      }
    }
  }
}

pub fn restore_like(
  ctx: Context,
  user: String,
  record: atp.Record,
  cache,
  counts: Counts,
) {
  let subject =
    decode.run(record.value, decode.at(["subject", "uri"], decode.string))
    |> result.unwrap("")
  case split_uri(subject) {
    Some(#(_, "app.rocksky.song", _)) -> {
      let likes = lt.table()
      use existing <- task.then(
        from(likes) |> where(eq(lt.uri(likes), Some(record.uri))) |> one(ctx.db),
      )
      case existing {
        Some(_) -> task.ok(Counts(..counts, skipped: counts.skipped + 1))
        None -> {
          use track <- task.then(resolve_track(ctx, subject, cache))
          case track {
            None -> task.ok(Counts(..counts, unresolved: counts.unresolved + 1))
            Some(track) -> {
              use existing <- task.then(
                from(likes)
                |> where(
                  and([
                    eq(lt.user_id(likes), user),
                    eq(lt.track_id(likes), track),
                  ]),
                )
                |> one(ctx.db),
              )
              case existing {
                Some(_) ->
                  task.ok(Counts(..counts, skipped: counts.skipped + 1))
                None -> {
                  let created = text(record.value, "createdAt")
                  use created <- task.then(case created {
                    "" -> task.ok(row.from_unix_ms(js.now_ms()))
                    _ ->
                      js.parse_date_ms(created)
                      |> option.map(row.from_unix_ms)
                      |> task.require("Invalid like timestamp")
                      |> task.from_result
                  })
                  use inserted <- task.map(
                    insert(likes, [
                      set(lt.user_id(likes), user),
                      set(lt.track_id(likes), track),
                      set(lt.uri(likes), Some(record.uri)),
                      set(lt.created_at(likes), created),
                    ])
                    |> on_conflict_do_nothing
                    |> returning(ctx.db)
                    |> task.map(fn(rows) {
                      list.first(rows) |> option.from_result
                    }),
                  )
                  case inserted {
                    None -> Counts(..counts, skipped: counts.skipped + 1)
                    Some(like) -> {
                      nats.publish(
                        ctx.nc,
                        "rocksky.like",
                        json.object([
                          #("uri", json.string(record.uri)),
                          #(
                            "user_id",
                            json.object([#("xata_id", json.string(user))]),
                          ),
                          #(
                            "track_id",
                            json.object([#("xata_id", json.string(track))]),
                          ),
                          #(
                            "xata_createdat",
                            json.string(row.iso8601(like.created_at)),
                          ),
                          #(
                            "xata_updatedat",
                            json.string(row.iso8601(like.created_at)),
                          ),
                          #("xata_id", json.string(like.id)),
                          #("xata_version", json.int(0)),
                        ])
                          |> json.to_string,
                      )
                      Counts(..counts, created: counts.created + 1)
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
    _ -> task.ok(counts)
  }
}

fn pages(
  ctx: Context,
  agent: atp.Agent,
  did: String,
  user: String,
  cursor,
  cache,
  counts: Counts,
) {
  use page <- task.then(
    atp.list_records(agent, did, "app.rocksky.like", 100, cursor, False)
    |> task.attempt_result,
  )
  use counts <- task.then(
    common.fold(page.records, counts, fn(record, counts) {
      restore_like(ctx, user, record, cache, counts)
    }),
  )
  case page.cursor {
    None -> task.ok(counts)
    Some(cursor) -> pages(ctx, agent, did, user, Some(cursor), cache, counts)
  }
}

pub fn backfill(ctx: Context, input: String, cache) {
  use did <- task.then(case string.starts_with(input, "did:") {
    True -> task.ok(input)
    False ->
      common.actor(
        ctx,
        string.drop_start(input, case string.starts_with(input, "@") {
          True -> 1
          False -> 0
        }),
      )
  })
  use identity <- task.then(
    identity.resolve_atproto_data(ctx.resolver, did) |> task.attempt_result,
  )
  let agent = atp.atp_agent(identity.pds)
  use user <- task.then(ensure_user(ctx, did, identity.handle, agent))
  pages(ctx, agent, did, user.id, None, cache, Counts(0, 0, 0))
}

pub fn execute(ctx: Context, args: List(String)) {
  case args {
    [] ->
      task.fail(error.InvalidRequest("Usage: backfill_likes <handle|did> ..."))
    _ -> {
      let cache = query_cache.new(86_400_000, 1_000_000)
      use _ <- task.then(
        common.each(args, fn(actor) {
          backfill(ctx, actor, cache)
          |> task.map(fn(_) { Nil })
          |> task.rescue(fn(e) {
            log.error(
              "Failed to backfill likes for "
              <> actor
              <> ": "
              <> error.describe(e),
            )
            task.ok(Nil)
          })
        }),
      )
      nats.flush(ctx.nc) |> task.attempt
    }
  }
}

pub fn main() {
  common.run(execute)
}
