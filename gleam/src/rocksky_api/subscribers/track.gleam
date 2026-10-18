import gleam/dynamic/decode
import gleam/result
import rocksky_api/context.{type Context}
import rocksky_api/drizzle/orm.{all, eq, from, where}
import rocksky_api/drizzle/schema/albums
import rocksky_api/drizzle/schema/artists
import rocksky_api/drizzle/schema/tracks
import rocksky_api/error
import rocksky_api/log
import rocksky_api/node/js
import rocksky_api/node/nats
import rocksky_api/task
import rocksky_api/typesense/search

fn decoder() {
  use track <- decode.subfield(["track", "xata_id"], decode.string)
  use artist <- decode.subfield(
    ["artist_album", "artist_id", "xata_id"],
    decode.string,
  )
  use album <- decode.subfield(
    ["artist_album", "album_id", "xata_id"],
    decode.string,
  )
  decode.success(#(track, artist, album))
}

fn recover(work: task.Task(Nil)) {
  work
  |> task.rescue(fn(e) {
    log.warn("[typesense] index failed: " <> error.describe(e))
    task.ok(Nil)
  })
}

pub fn handle(ctx: Context, payload: String) {
  use raw <- task.then(
    js.parse_json(payload) |> result.map_error(error.Js) |> task.from_result,
  )
  use ids <- task.then(
    decode.run(raw, decoder())
    |> result.map_error(error.Decode("rocksky.track", _))
    |> task.from_result,
  )
  let t = tracks.table()
  let a = artists.table()
  let b = albums.table()
  use rows <- task.then(task.all3(
    from(t) |> where(eq(tracks.id(t), ids.0)) |> all(ctx.db),
    from(a) |> where(eq(artists.id(a), ids.1)) |> all(ctx.db),
    from(b) |> where(eq(albums.id(b), ids.2)) |> all(ctx.db),
  ))
  task.all([
    search.index_albums(ctx.typesense, rows.2) |> recover,
    search.index_artists(ctx.typesense, rows.1) |> recover,
    search.index_tracks(ctx.typesense, rows.0) |> recover,
  ])
  |> task.map(fn(_) { Nil })
}

pub fn start(ctx: Context) {
  nats.subscribe(ctx.nc, "rocksky.track", fn(payload) {
    handle(ctx, payload)
    |> task.unwrap_or(fn(e) {
      log.error("rocksky.track handler: " <> error.describe(e))
    })
  })
}
