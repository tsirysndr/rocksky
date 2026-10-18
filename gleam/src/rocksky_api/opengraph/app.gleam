import gleam/json
import gleam/option.{type Option, None, Some}
import gleam/result
import gleam/string
import gleam/uri
import rocksky_api/context.{type Context}
import rocksky_api/drizzle/orm.{
  eq, eq_columns, field, from, left_join, nullable, one, or, pair, select, where,
}
import rocksky_api/drizzle/schema/albums as al
import rocksky_api/drizzle/schema/artists as ar
import rocksky_api/drizzle/schema/scrobbles as sc
import rocksky_api/drizzle/schema/tracks as tr
import rocksky_api/drizzle/schema/users as us
import rocksky_api/error
import rocksky_api/lib/respond
import rocksky_api/node/hono
import rocksky_api/task

fn metadata(
  title: String,
  description: String,
  image: Option(String),
  url: String,
  omit_image: Bool,
) {
  json.object([
    #("title", json.string(title)),
    #("description", json.string(description)),
    #("url", json.string(url)),
    #("type", json.string("website")),
    #("twitterCard", json.string("summary_large_image")),
    ..case omit_image {
      True -> []
      False -> [
        #("image", case image {
          Some(value) -> json.string(value)
          None -> json.null()
        }),
      ]
    }
  ])
}

fn decode(value: String) {
  uri.percent_decode(value)
  |> result.map_error(fn(_) { error.Message("URI malformed") })
  |> task.from_result
}

fn record(ctx: Context, did: String, kind: String, rkey: String) {
  let record_uri = "at://" <> did <> "/app.rocksky." <> kind <> "/" <> rkey
  let url = "https://rocksky.app/" <> did <> "/" <> kind <> "/" <> rkey
  let missing = error.NotFound("OG Service: record not found.")
  case kind {
    "album" -> {
      let table = al.table()
      use row <- task.then(
        from(table)
        |> where(eq(al.uri(table), Some(record_uri)))
        |> one(ctx.read_db),
      )
      case row {
        None -> task.fail(missing)
        Some(r) ->
          task.ok(metadata(
            "Album: " <> r.title <> " by " <> r.artist,
            "See listening stats and favorites for "
              <> r.title
              <> " by "
              <> r.artist
              <> " on Rocksky.",
            r.album_art,
            url,
            False,
          ))
      }
    }
    "artist" -> {
      let table = ar.table()
      use row <- task.then(
        from(table)
        |> where(eq(ar.uri(table), Some(record_uri)))
        |> one(ctx.read_db),
      )
      case row {
        None -> task.fail(missing)
        Some(r) ->
          task.ok(metadata(
            "Artist: " <> r.name,
            "See listening stats and favorites for " <> r.name <> " on Rocksky.",
            r.picture,
            url,
            False,
          ))
      }
    }
    "song" -> {
      let table = tr.table()
      use row <- task.then(
        from(table)
        |> where(eq(tr.uri(table), Some(record_uri)))
        |> one(ctx.read_db),
      )
      case row {
        None -> task.fail(missing)
        Some(r) ->
          task.ok(metadata(
            "Track: " <> r.title <> " by " <> r.artist,
            "See listening stats and favorites for "
              <> r.title
              <> " by "
              <> r.artist
              <> " on Rocksky.",
            r.album_art,
            url,
            False,
          ))
      }
    }
    _ -> {
      let s = sc.table()
      let t = tr.table()
      let a = ar.table()
      let u = us.table()
      let album = al.table()
      use row <- task.then(
        select(
          s,
          pair(
            pair(
              field("title", nullable(tr.title(t))),
              field("artist", nullable(ar.name(a))),
            ),
            pair(
              field("handle", nullable(us.handle(u))),
              field("image", al.album_art(album)),
            ),
          ),
        )
        |> left_join(t, eq_columns(sc.track_id(s), nullable(tr.id(t))))
        |> left_join(a, eq_columns(sc.artist_id(s), nullable(ar.id(a))))
        |> left_join(u, eq_columns(sc.user_id(s), nullable(us.id(u))))
        |> left_join(album, eq_columns(sc.album_id(s), nullable(al.id(album))))
        |> where(eq(sc.uri(s), Some(record_uri)))
        |> one(ctx.read_db),
      )
      case row {
        None -> task.fail(missing)
        Some(#(#(Some(title), Some(artist)), #(Some(handle), image))) ->
          task.ok(metadata(
            "Scrobble: " <> title <> " by " <> artist,
            "A listening activity (scrobble) - "
              <> title
              <> " - "
              <> artist
              <> " by @"
              <> handle
              <> " on Rocksky.",
            image,
            url,
            False,
          ))
        _ -> task.fail(error.Message("Incomplete scrobble metadata"))
      }
    }
  }
}

pub fn retrieve(ctx: Context, path: String) {
  case string.split(path, "/") {
    ["", "profile", handle] if handle != "" -> {
      use handle <- task.then(decode(handle))
      let users = us.table()
      use row <- task.then(
        from(users)
        |> where(or([eq(us.handle(users), handle), eq(us.did(users), handle)]))
        |> one(ctx.read_db),
      )
      case row {
        None -> task.fail(error.NotFound("OG Service: user not found."))
        Some(user) ->
          task.ok(metadata(
            "@" <> user.handle <> " on Rocksky",
            "Rocksky user profile — recent scrobbles, top artists, albums, and tracks.",
            Some(user.avatar),
            "https://rocksky.app/profile/" <> user.handle,
            string.ends_with(user.avatar, "/@jpeg"),
          ))
      }
    }
    ["", did, kind, rkey]
      if rkey != ""
      && {
        kind == "scrobble"
        || kind == "album"
        || kind == "artist"
        || kind == "song"
      }
    -> {
      case string.starts_with(did, "did:plc:") && string.length(did) > 8 {
        False ->
          task.fail(error.InvalidRequest("OG Service: unsupported path format."))
        True -> {
          use did <- task.then(decode(did))
          use rkey <- task.then(decode(rkey))
          record(ctx, did, kind, rkey)
        }
      }
    }
    _ -> task.fail(error.InvalidRequest("OG Service: unsupported path format."))
  }
}

pub fn app(ctx: Context) {
  hono.new()
  |> hono.get("/", fn(c) {
    case hono.query(c, "path") {
      None | Some("") ->
        hono.text(c, "OG Service: please provide a path query parameter.", 400)
        |> hono.respond
      Some(path) -> respond.json(c, retrieve(ctx, path))
    }
  })
}
