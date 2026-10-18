import gleam/dict
import gleam/dynamic.{type Dynamic}
import gleam/dynamic/decode
import gleam/json
import gleam/list
import gleam/option.{None, Some}
import gleam/order
import gleam/result
import gleam/string
import rocksky_api/atproto/agent as atp
import rocksky_api/context.{type Context}
import rocksky_api/drizzle/orm.{
  all, eq, eq_columns, field, in_array, inner_join, run, select, set, update,
  where,
}
import rocksky_api/drizzle/schema/albums as al
import rocksky_api/drizzle/schema/artists as ar
import rocksky_api/drizzle/schema/tracks as tr
import rocksky_api/drizzle/schema/user_albums as ul
import rocksky_api/drizzle/schema/user_artists as ua
import rocksky_api/drizzle/schema/user_tracks as ut
import rocksky_api/drizzle/schema/users as us
import rocksky_api/error
import rocksky_api/lib/agent
import rocksky_api/log
import rocksky_api/scripts/common
import rocksky_api/scripts/typesense_import
import rocksky_api/task

pub type Collection {
  Artist
  Album
  Song
}

pub type RepoRecord {
  RepoRecord(uri: String, rkey: String, created_at: String, key: String)
}

pub type Plan {
  Plan(keeper: RepoRecord, gone: List(RepoRecord))
}

fn nsid(collection) {
  "app.rocksky."
  <> case collection {
    Artist -> "artist"
    Album -> "album"
    Song -> "song"
  }
}

fn text(value: Dynamic, key: String) {
  decode.run(value, decode.field(key, decode.string, decode.success))
  |> result.unwrap("")
}

pub fn identity_key(collection: Collection, value: Dynamic) {
  let parts = case collection {
    Artist -> [text(value, "name")]
    Album -> [text(value, "title"), text(value, "artist")]
    Song -> [text(value, "title"), text(value, "artist"), text(value, "album")]
  }
  case list.any(parts, fn(p) { p == "" }) {
    True -> None
    False -> Some(string.join(parts, " - ") |> string.lowercase)
  }
}

pub fn plan(records: List(RepoRecord), linked: List(String)) {
  let groups =
    list.fold(records, dict.new(), fn(acc, r) {
      dict.insert(
        acc,
        r.key,
        list.append(result.unwrap(dict.get(acc, r.key), []), [r]),
      )
    })
  dict.values(groups)
  |> list.filter_map(fn(group) {
    case list.length(group) > 1 {
      False -> Error(Nil)
      True -> {
        let sorted =
          list.sort(group, fn(a, b) {
            case string.compare(a.created_at, b.created_at) {
              order.Eq -> string.compare(a.rkey, b.rkey)
              order -> order
            }
          })
        use oldest <- result.try(list.first(sorted))
        let keeper =
          list.find(sorted, fn(r) { list.contains(linked, r.uri) })
          |> result.unwrap(oldest)
        Ok(Plan(keeper, list.filter(group, fn(r) { r.uri != keeper.uri })))
      }
    }
  })
}

fn records(
  agent: atp.Agent,
  did: String,
  collection: Collection,
  cursor: option.Option(String),
  acc: List(RepoRecord),
) {
  use page <- task.then(
    atp.list_records(agent, did, nsid(collection), 100, cursor, False)
    |> task.attempt_result,
  )
  let found =
    list.filter_map(page.records, fn(record) {
      use key <- result.try(
        identity_key(collection, record.value) |> option.to_result(Nil),
      )
      Ok(RepoRecord(
        record.uri,
        atp.rkey_of(record.uri),
        text(record.value, "createdAt"),
        key,
      ))
    })
  let acc = list.append(acc, found)
  case page.cursor {
    None -> task.ok(acc)
    Some(cursor) -> records(agent, did, collection, Some(cursor), acc)
  }
}

fn links(ctx: Context, did: String, table, uri, user_id) {
  let users = us.table()
  select(table, field("uri", uri))
  |> inner_join(users, eq_columns(user_id, us.id(users)))
  |> where(eq(us.did(users), did))
  |> all(ctx.db)
}

fn linked(ctx: Context, did: String, collection: Collection) {
  case collection {
    Artist -> {
      let t = ua.table()
      links(ctx, did, t, ua.uri(t), ua.user_id(t))
    }
    Album -> {
      let t = ul.table()
      links(ctx, did, t, ul.uri(t), ul.user_id(t))
    }
    Song -> {
      let t = ut.table()
      links(ctx, did, t, ut.uri(t), ut.user_id(t))
    }
  }
}

fn replace(ctx: Context, table, column, keeper, gone) {
  update(table, [set(column, keeper)], in_array(column, gone))
  |> run(ctx.db)
  |> task.map(fn(_) { Nil })
  |> task.rescue(fn(e) {
    log.warn("Could not repoint URI: " <> error.describe(e))
    task.ok(Nil)
  })
}

pub fn repoint(
  ctx: Context,
  collection: Collection,
  keeper: String,
  gone: List(String),
) {
  let artists = ar.table()
  let albums = al.table()
  let tracks = tr.table()
  case collection {
    Artist -> {
      let users = ua.table()
      use _ <- task.then(replace(
        ctx,
        users,
        ua.uri(users),
        Some(keeper),
        list.map(gone, Some),
      ))
      use _ <- task.then(replace(
        ctx,
        artists,
        ar.uri(artists),
        Some(keeper),
        list.map(gone, Some),
      ))
      use _ <- task.then(replace(
        ctx,
        tracks,
        tr.artist_uri(tracks),
        Some(keeper),
        list.map(gone, Some),
      ))
      replace(
        ctx,
        albums,
        al.artist_uri(albums),
        Some(keeper),
        list.map(gone, Some),
      )
    }
    Album -> {
      let users = ul.table()
      use _ <- task.then(replace(
        ctx,
        users,
        ul.uri(users),
        Some(keeper),
        list.map(gone, Some),
      ))
      use _ <- task.then(replace(
        ctx,
        albums,
        al.uri(albums),
        Some(keeper),
        list.map(gone, Some),
      ))
      replace(
        ctx,
        tracks,
        tr.album_uri(tracks),
        Some(keeper),
        list.map(gone, Some),
      )
    }
    Song -> {
      let users = ut.table()
      use _ <- task.then(replace(
        ctx,
        users,
        ut.uri(users),
        Some(keeper),
        list.map(gone, Some),
      ))
      replace(ctx, tracks, tr.uri(tracks), Some(keeper), list.map(gone, Some))
    }
  }
}

fn dedup(
  ctx: Context,
  agent: atp.Agent,
  did: String,
  collection: Collection,
  dry: Bool,
) {
  use rows <- task.then(records(agent, did, collection, None, []))
  use linked <- task.then(linked(ctx, did, collection))
  let plan = plan(rows, list.filter_map(linked, option.to_result(_, Nil)))
  list.each(plan, fn(p) {
    log.info("Keep " <> p.keeper.uri <> " (" <> p.keeper.key <> ")")
  })
  case dry {
    True -> task.ok(Nil)
    False -> {
      let gone = list.flat_map(plan, fn(p) { p.gone })
      use _ <- task.then(
        common.each(list.sized_chunk(gone, 100), fn(batch) {
          use _ <- task.then(
            atp.apply_writes(
              agent,
              did,
              json.array(batch, fn(r) {
                json.object([
                  #("$type", json.string("com.atproto.repo.applyWrites#delete")),
                  #("collection", json.string(nsid(collection))),
                  #("rkey", json.string(r.rkey)),
                ])
              }),
            )
            |> task.attempt_result,
          )
          task.sleep(500) |> task.attempt
        }),
      )
      common.each(plan, fn(p) {
        repoint(
          ctx,
          collection,
          p.keeper.uri,
          list.map(p.gone, fn(r) { r.uri }),
        )
      })
    }
  }
}

pub fn execute(ctx: Context, args: List(String)) {
  let only = typesense_import.option_value(args, "--only")
  let collections = case only {
    "" -> ["artist", "album", "song"]
    _ -> string.split(only, ",")
  }
  use collections <- task.then(
    list.try_map(collections, fn(c) {
      case c {
        "artist" -> Ok(Artist)
        "album" -> Ok(Album)
        "song" -> Ok(Song)
        _ -> Error(error.InvalidRequest("Unknown collection: " <> c))
      }
    })
    |> task.from_result,
  )
  use target <- task.then(
    list.find(args, fn(a) { !string.starts_with(a, "--") && a != only })
    |> result.map_error(fn(_) { error.InvalidRequest("Expected handle or DID") })
    |> task.from_result,
  )
  use did <- task.then(common.actor(ctx, target))
  use agent <- task.then(agent.require(ctx, did))
  common.each(collections, fn(c) {
    dedup(ctx, agent, did, c, list.contains(args, "--dry-run"))
  })
}

pub fn main() {
  common.run(execute)
}
