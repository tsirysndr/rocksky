import gleam/option.{None, Some}
import rocksky_api/context.{type Context}
import rocksky_api/drizzle/orm.{
  all, and, eq, eq_columns, from, insert, left_join, limit, offset,
  on_conflict_do_nothing, one, run, set, where,
}
import rocksky_api/drizzle/schema/albums as al
import rocksky_api/drizzle/schema/artist_albums as aa
import rocksky_api/drizzle/schema/artists as ar
import rocksky_api/drizzle/schema/tracks as tr
import rocksky_api/schema/tracks
import rocksky_api/scripts/common
import rocksky_api/task

pub fn link(ctx: Context, track: tracks.Track) {
  case track.artist_uri, track.album_uri {
    Some(artist_uri), Some(album_uri) if artist_uri != "" && album_uri != "" -> {
      let artists = ar.table()
      let albums = al.table()
      let links = aa.table()
      use existing <- task.then(
        from(links)
        |> left_join(artists, eq_columns(aa.artist_id(links), ar.id(artists)))
        |> left_join(albums, eq_columns(aa.album_id(links), al.id(albums)))
        |> where(
          and([
            eq(ar.uri(artists), Some(artist_uri)),
            eq(al.uri(albums), Some(album_uri)),
          ]),
        )
        |> one(ctx.db),
      )
      case existing {
        Some(_) -> task.ok(Nil)
        None -> {
          use artist <- task.then(
            from(artists)
            |> where(eq(ar.uri(artists), Some(artist_uri)))
            |> one(ctx.db),
          )
          use album <- task.then(
            from(albums)
            |> where(eq(al.uri(albums), Some(album_uri)))
            |> one(ctx.db),
          )
          case artist, album {
            Some(artist), Some(album) ->
              insert(links, [
                set(aa.artist_id(links), artist.id),
                set(aa.album_id(links), album.id),
              ])
              |> on_conflict_do_nothing
              |> run(ctx.db)
              |> task.map(fn(_) { Nil })
            _, _ -> task.ok(Nil)
          }
        }
      }
    }
    _, _ -> task.ok(Nil)
  }
}

fn batch(ctx: Context, start: Int) {
  use tracks <- task.then(
    from(tr.table()) |> offset(start) |> limit(100) |> all(ctx.db),
  )
  case tracks {
    [] -> task.ok(Nil)
    _ -> {
      use _ <- task.then(common.each(tracks, fn(track) { link(ctx, track) }))
      batch(ctx, start + 100)
    }
  }
}

pub fn execute(ctx: Context, _args) {
  batch(ctx, 0)
}

pub fn main() {
  common.run(execute)
}
