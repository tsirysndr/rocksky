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
import rocksky_api/drizzle/schema/tracks as t
import rocksky_api/drizzle/schema/users as u
import rocksky_api/error
import rocksky_api/lib/discogs_enrichment
import rocksky_api/log
import rocksky_api/node/crypto
import rocksky_api/node/nats
import rocksky_api/nowplaying/publish
import rocksky_api/schema/tracks
import rocksky_api/task

fn hash(value: String) {
  string.lowercase(value) |> crypto.sha256_hex
}

fn missing(value) {
  case value {
    None | Some("") -> True
    _ -> False
  }
}

fn heal(ctx: Context, track: tracks.Track) {
  let tracks = t.table()
  let albums = al.table()
  let artists = ar.table()
  use existing <- task.then(
    from(tracks)
    |> where(eq(
      t.sha256(tracks),
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
        Some(a) ->
          case missing(existing.album_uri) {
            True ->
              update(
                tracks,
                [set(t.album_uri(tracks), a.uri)],
                eq(t.id(tracks), existing.id),
              )
              |> run(ctx.db)
              |> task.map(fn(_) { Nil })
            False -> task.ok(Nil)
          }
        None -> task.ok(Nil)
      })
      use _ <- task.then(case artist {
        Some(a) ->
          case missing(existing.artist_uri) {
            True ->
              update(
                tracks,
                [set(t.artist_uri(tracks), a.uri)],
                eq(t.id(tracks), existing.id),
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

pub fn update_uris(ctx: Context, did: String) {
  let scrobbles = sc.table()
  let tracks = t.table()
  let users = u.table()
  use rows <- task.then(
    select(scrobbles, all_columns(tracks))
    |> inner_join(
      tracks,
      eq_columns(sc.track_id(scrobbles), nullable(t.id(tracks))),
    )
    |> inner_join(
      users,
      eq_columns(sc.user_id(scrobbles), nullable(u.id(users))),
    )
    |> where(or([eq(u.did(users), did), eq(u.handle(users), did)]))
    |> order_by([desc(sc.created_at(scrobbles))])
    |> limit(5)
    |> all(ctx.db),
  )
  task.each_(rows, heal(ctx, _))
}

pub fn refresh_scrobbles(ctx: Context, did: String) {
  let scrobbles = sc.table()
  let users = u.table()
  use rows <- task.then(
    select(scrobbles, field("id", sc.id(scrobbles)))
    |> inner_join(
      users,
      eq_columns(sc.user_id(scrobbles), nullable(u.id(users))),
    )
    |> where(or([eq(u.did(users), did), eq(u.handle(users), did)]))
    |> order_by([desc(sc.created_at(scrobbles))])
    |> limit(5)
    |> all(ctx.db),
  )
  task.each_(rows, fn(id) {
    publish.publish_scrobble(ctx, id)
    |> task.map(fn(_) { Nil })
    |> task.rescue(fn(e) {
      log.error("Failed to sync scrobble " <> id <> ": " <> error.describe(e))
      task.ok(Nil)
    })
  })
}

pub fn handle(ctx: Context, id: String) {
  let scrobbles = sc.table()
  let users = u.table()
  use record <- task.then(
    from(scrobbles) |> where(eq(sc.id(scrobbles), id)) |> one(ctx.db),
  )
  case record {
    None -> task.ok(Nil)
    Some(record) -> {
      use user <- task.then(
        from(users)
        |> where(eq(nullable(u.id(users)), record.user_id))
        |> one(ctx.db)
        |> task.require_task("Scrobble user missing"),
      )
      use _ <- task.then(update_uris(ctx, user.did))
      use _ <- task.map(refresh_scrobbles(ctx, user.did))
      case ctx.env.discogs_enrichment_enabled {
        False -> Nil
        True ->
          task.background(
            discogs_enrichment.enrich_scrobble_with_discogs(
              ctx,
              option.unwrap(record.track_id, ""),
            ),
            fn(e) {
              log.warn("Discogs enrichment failed: " <> error.describe(e))
            },
          )
      }
    }
  }
}

pub fn start(ctx: Context) {
  nats.subscribe(ctx.nc, "rocksky.scrobble.new", fn(id) {
    handle(ctx, id)
    |> task.unwrap_or(fn(e) {
      log.error("rocksky.scrobble.new: " <> error.describe(e))
    })
  })
}
