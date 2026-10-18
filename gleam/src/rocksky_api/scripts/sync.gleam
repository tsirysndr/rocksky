import gleam/int
import gleam/list
import gleam/option.{None, Some}
import gleam/string
import rocksky_api/context.{type Context}
import rocksky_api/drizzle/orm.{
  all, all_columns, desc, eq, eq_columns, field, from, inner_join, limit,
  nullable, one, or, order_by, run, select, set, update, where,
}
import rocksky_api/drizzle/schema/albums as al
import rocksky_api/drizzle/schema/artists as ar
import rocksky_api/drizzle/schema/scrobbles as sc
import rocksky_api/drizzle/schema/tracks as tr
import rocksky_api/drizzle/schema/users as us
import rocksky_api/error
import rocksky_api/log
import rocksky_api/node/crypto
import rocksky_api/node/nats
import rocksky_api/node/process
import rocksky_api/nowplaying/publish
import rocksky_api/schema/tracks
import rocksky_api/scripts/common
import rocksky_api/task

fn missing(uri) {
  option.unwrap(uri, "") == ""
}

fn hash(value) {
  crypto.sha256_hex(string.lowercase(value))
}

pub fn repair(ctx: Context, track: tracks.Track) {
  let tracks = tr.table()
  let albums = al.table()
  let artists = ar.table()
  use existing <- task.then(
    from(tracks)
    |> where(eq(
      tr.sha256(tracks),
      hash(track.title <> " - " <> track.artist <> " - " <> track.album),
    ))
    |> one(ctx.db),
  )
  case existing {
    None -> task.ok(Nil)
    Some(existing) -> {
      use album <- task.then(
        from(albums)
        |> where(eq(
          al.sha256(albums),
          hash(track.album <> " - " <> track.album_artist),
        ))
        |> one(ctx.db),
      )
      use artist <- task.then(
        from(artists)
        |> where(eq(ar.sha256(artists), hash(track.album_artist)))
        |> one(ctx.db),
      )
      use _ <- task.then(case album {
        Some(album) ->
          case missing(existing.album_uri) {
            True ->
              update(
                tracks,
                [set(tr.album_uri(tracks), album.uri)],
                eq(tr.id(tracks), existing.id),
              )
              |> run(ctx.db)
              |> task.map(fn(_) { Nil })
            False -> task.ok(Nil)
          }
        None -> task.ok(Nil)
      })
      use _ <- task.then(case artist {
        Some(artist) ->
          case missing(existing.artist_uri) {
            True ->
              update(
                tracks,
                [set(tr.artist_uri(tracks), artist.uri)],
                eq(tr.id(tracks), existing.id),
              )
              |> run(ctx.db)
              |> task.map(fn(_) { Nil })
            False -> task.ok(Nil)
          }
        None -> task.ok(Nil)
      })
      case album, artist {
        Some(album), Some(artist) ->
          case missing(album.artist_uri) {
            True ->
              update(
                albums,
                [set(al.artist_uri(albums), artist.uri)],
                eq(al.id(albums), album.id),
              )
              |> run(ctx.db)
              |> task.map(fn(_) { Nil })
            False -> task.ok(Nil)
          }
        _, _ -> task.ok(Nil)
      }
    }
  }
}

pub fn update_uris(ctx: Context, actor: String, size: Int) {
  let scrobbles = sc.table()
  let tracks = tr.table()
  let users = us.table()
  use rows <- task.then(
    select(scrobbles, all_columns(tracks))
    |> inner_join(
      tracks,
      eq_columns(sc.track_id(scrobbles), nullable(tr.id(tracks))),
    )
    |> inner_join(
      users,
      eq_columns(sc.user_id(scrobbles), nullable(us.id(users))),
    )
    |> where(or([eq(us.did(users), actor), eq(us.handle(users), actor)]))
    |> order_by([desc(sc.created_at(scrobbles))])
    |> limit(size)
    |> all(ctx.db),
  )
  common.each(rows, fn(track) { repair(ctx, track) })
}

pub fn sync_actor(ctx: Context, actor: String, size: Int, publish_size: Int) {
  use _ <- task.then(update_uris(ctx, actor, size))
  let scrobbles = sc.table()
  let users = us.table()
  use rows <- task.then(
    select(scrobbles, field("id", sc.id(scrobbles)))
    |> inner_join(
      users,
      eq_columns(sc.user_id(scrobbles), nullable(us.id(users))),
    )
    |> where(or([eq(us.did(users), actor), eq(us.handle(users), actor)]))
    |> order_by([desc(sc.created_at(scrobbles))])
    |> limit(publish_size)
    |> all(ctx.db),
  )
  common.each(rows, fn(id) {
    publish.publish_scrobble(ctx, id)
    |> task.map(fn(_) { Nil })
    |> task.rescue(fn(e) {
      log.error("Failed to sync scrobble " <> id <> ": " <> error.describe(e))
      task.ok(Nil)
    })
  })
}

fn background(ctx: Context, sub: nats.Subscription, size: Int) {
  use message <- task.then(nats.next_message(sub) |> task.attempt_result)
  case message {
    None -> task.ok(Nil)
    Some(actor) -> {
      use _ <- task.then(task.sleep(15_000) |> task.attempt)
      use _ <- task.then(sync_actor(ctx, actor, size, 5))
      background(ctx, sub, size)
    }
  }
}

pub fn execute(ctx: Context, args: List(String)) {
  let size =
    process.env("SYNC_SIZE")
    |> option.then(fn(s) { int.parse(s) |> option.from_result })
    |> option.unwrap(20)
  case list.contains(args, "--background") {
    True ->
      background(
        ctx,
        nats.subscribe_raw(ctx.nc, "rocksky.user.scrobble.sync"),
        size,
      )
    False -> common.each(args, fn(actor) { sync_actor(ctx, actor, size, size) })
  }
}

pub fn main() {
  common.run(execute)
}
