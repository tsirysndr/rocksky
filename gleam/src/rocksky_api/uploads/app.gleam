import gleam/dynamic/decode
import gleam/int
import gleam/javascript/promise
import gleam/json
import gleam/option.{None, Some}
import gleam/result
import gleam/string
import rocksky_api/context.{type Context}
import rocksky_api/drizzle/orm.{
  all, and, count, eq, eq_columns, field, from, inner_join, one, required,
  select, where,
}
import rocksky_api/drizzle/schema/tracks as tr
import rocksky_api/drizzle/schema/user_uploads as up
import rocksky_api/error
import rocksky_api/lib/auth
import rocksky_api/lib/respond
import rocksky_api/node/hono
import rocksky_api/task
import rocksky_api/uploads/delete_service
import rocksky_api/uploads/ingest
import rocksky_api/uploads/listing
import rocksky_api/uploads/queue
import rocksky_api/uploads/stream

pub fn query(c: hono.Context, key: String) {
  case hono.query(c, key) |> option.map(string.trim) {
    Some("") -> None
    value -> value
  }
}

fn number(c: hono.Context, key: String, fallback: Int) {
  case query(c, key) {
    None -> fallback
    Some(v) ->
      case int.parse(v) {
        Ok(0) -> fallback
        Ok(v) -> v
        Error(_) -> fallback
      }
  }
}

fn pagination(c: hono.Context) {
  #(int.min(number(c, "size", 50), 200), number(c, "offset", 0))
}

fn ok() {
  json.object([#("status", json.string("ok"))])
}

fn deleted(n) {
  json.object([#("status", json.string("ok")), #("deleted", json.int(n))])
}

pub fn app(ctx: Context) {
  hono.new()
  |> hono.post("/track", ingest.upload(ctx, _))
  |> hono.get("/", fn(c) {
    let work = {
      use user <- task.then(auth.user(ctx, c))
      let #(size, offset) = pagination(c)
      listing.uploads(
        ctx,
        user.id,
        size,
        offset,
        query(c, "q"),
        query(c, "albumUri"),
        query(c, "albumArtist"),
        query(c, "albumName"),
      )
    }
    respond.json(c, work)
  })
  |> hono.get("/count", fn(c) {
    let work = {
      use user <- task.then(auth.user(ctx, c))
      let uploads = up.table()
      use total <- task.map(
        select(uploads, field("total", count()))
        |> where(eq(up.user_id(uploads), user.id))
        |> required(ctx.db, "Upload count unavailable"),
      )
      json.object([#("total", json.int(total))])
    }
    use outcome <- promise.map(work)
    case outcome {
      Ok(value) -> hono.json(c, value, 200)
      Error(error.Unauthorized(_)) ->
        hono.json(
          c,
          json.object([#("error", json.string("Unauthorized"))]),
          401,
        )
      Error(e) -> respond.error(c, e)
    }
  })
  |> hono.get("/albums", fn(c) {
    let work = {
      use user <- task.then(auth.user(ctx, c))
      let #(size, offset) = pagination(c)
      listing.albums(
        ctx,
        user.id,
        size,
        offset,
        query(c, "q") |> option.map(string.lowercase),
      )
    }
    respond.json(c, work)
  })
  |> hono.get("/artists", fn(c) {
    let work = {
      use user <- task.then(auth.user(ctx, c))
      let #(size, offset) = pagination(c)
      listing.artists(
        ctx,
        user.id,
        size,
        offset,
        query(c, "q") |> option.map(string.lowercase),
      )
    }
    respond.json(c, work)
  })
  |> hono.get("/stream-token", stream.token(ctx, _))
  |> hono.options("/:id/stream", stream.options)
  |> hono.get("/:id/stream", stream.stream(ctx, _))
  |> hono.get("/queue", fn(c) {
    respond.json(c, {
      use user <- task.then(auth.user(ctx, c))
      queue.retrieve(ctx, user.id)
    })
  })
  |> hono.put("/queue", fn(c) {
    let work = {
      use user <- task.then(auth.user(ctx, c))
      use body <- task.then(hono.json_body(c) |> task.attempt_result)
      let decoder = {
        use ids <- decode.field("uploadIds", decode.list(decode.string))
        use index <- decode.field("currentIndex", decode.int)
        decode.success(#(ids, index))
      }
      use body <- task.then(
        decode.run(body, decoder)
        |> result.map_error(fn(_) { error.InvalidRequest("Invalid body") })
        |> task.from_result,
      )
      queue.put(ctx, user.id, body.0, body.1)
    }
    respond.json(c, work)
  })
  |> hono.delete("/album", fn(c) {
    let work = {
      use user <- task.then(auth.user(ctx, c))
      case
        listing.album_filter(
          query(c, "albumUri"),
          query(c, "albumArtist"),
          query(c, "albumName"),
        )
      {
        None ->
          task.ok(hono.json(
            c,
            json.object([
              #("error", json.string("MISSING_ALBUM")),
              #(
                "message",
                json.string("albumUri or albumArtist + albumName is required"),
              ),
            ]),
            400,
          ))
        Some(filter) -> {
          let uploads = up.table()
          let tracks = tr.table()
          use rows <- task.then(
            from(uploads)
            |> inner_join(
              tracks,
              eq_columns(up.track_id(uploads), tr.id(tracks)),
            )
            |> where(and([eq(up.user_id(uploads), user.id), filter]))
            |> all(ctx.db),
          )
          use n <- task.map(delete_service.purge_uploads(ctx, user.id, rows))
          hono.json(c, deleted(n), 200)
        }
      }
    }
    respond.with(c, work, fn(r) { r })
  })
  |> hono.delete("/by-album/:albumId", fn(c) {
    let work = {
      use user <- task.then(auth.user(ctx, c))
      delete_service.delete_uploads_for_album_id(
        ctx,
        user.did,
        hono.param(c, "albumId"),
      )
      |> task.map(deleted)
    }
    respond.json(c, work)
  })
  |> hono.delete("/by-track/:trackId", fn(c) { delete_one(ctx, c, True) })
  |> hono.delete("/:id", fn(c) { delete_one(ctx, c, False) })
}

fn delete_one(ctx: Context, c: hono.Context, by_track: Bool) {
  let work = {
    use user <- task.then(auth.user(ctx, c))
    let uploads = up.table()
    let filter = case by_track {
      True -> eq(up.track_id(uploads), hono.param(c, "trackId"))
      False -> eq(up.id(uploads), hono.param(c, "id"))
    }
    use upload <- task.then(
      from(uploads)
      |> where(and([eq(up.user_id(uploads), user.id), filter]))
      |> one(ctx.db)
      |> task.require_task("Upload not found"),
    )
    delete_service.purge_uploads(ctx, user.id, [upload])
    |> task.map(fn(_) { ok() })
  }
  respond.json(c, work)
}
