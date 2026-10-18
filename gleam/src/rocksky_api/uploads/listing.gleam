import gleam/json
import gleam/list
import gleam/option.{None, Some}
import rocksky_api/context.{type Context}
import rocksky_api/drizzle/orm.{
  all, all_columns, and, asc, count_distinct, eq, eq_columns, field, group_by,
  in_array, inner_join, left_join, like, limit, lower, max, nested, offset, or,
  order_by, pair, reference, select, where,
}
import rocksky_api/drizzle/schema/albums as al
import rocksky_api/drizzle/schema/tracks as tr
import rocksky_api/drizzle/schema/user_uploads as up
import rocksky_api/schema/tracks
import rocksky_api/schema/user_uploads
import rocksky_api/task
import rocksky_api/typesense/library

pub fn album_filter(album_uri, artist, name) {
  let tracks = tr.table()
  case album_uri, artist, name {
    Some(uri), _, _ -> Some(eq(tr.album_uri(tracks), Some(uri)))
    _, Some(artist), Some(name) ->
      Some(
        and([eq(tr.album_artist(tracks), artist), eq(tr.album(tracks), name)]),
      )
    _, _, _ -> None
  }
}

pub fn uploads(
  ctx: Context,
  user_id: String,
  size: Int,
  skip: Int,
  search,
  album_uri,
  album_artist,
  album_name,
) {
  let uploads = up.table()
  let tracks = tr.table()
  let albums = al.table()
  let base =
    select(
      uploads,
      pair(
        pair(
          nested("upload", all_columns(uploads)),
          nested("track", all_columns(tracks)),
        ),
        pair(
          field("albumReleaseDate", al.release_date(albums)),
          field("albumYear", al.year(albums)),
        ),
      ),
    )
    |> inner_join(tracks, eq_columns(up.track_id(uploads), tr.id(tracks)))
    |> left_join(albums, eq_columns(al.uri(albums), tr.album_uri(tracks)))
  let work = case search {
    Some(query) -> {
      use hits <- task.then(library.search_library_tracks(
        ctx.typesense,
        query,
        user_id,
        size,
        skip,
      ))
      let ids = list.map(hits, fn(h) { h.id })
      case ids {
        [] -> task.ok([])
        _ -> {
          use rows <- task.map(
            base
            |> where(
              and([
                eq(up.user_id(uploads), user_id),
                in_array(up.id(uploads), ids),
              ]),
            )
            |> all(ctx.db),
          )
          list.filter_map(ids, fn(id) {
            list.find(rows, fn(r) { r.0.0.id == id })
          })
        }
      }
    }
    None -> {
      let filter = album_filter(album_uri, album_artist, album_name)
      base
      |> where(
        and([
          eq(up.user_id(uploads), user_id),
          ..case filter {
            Some(f) -> [f]
            None -> []
          }
        ]),
      )
      |> order_by(
        list.append(
          case filter {
            Some(_) -> [asc(tr.track_number(tracks))]
            None -> []
          },
          [asc(tr.title(tracks)), asc(tr.artist(tracks))],
        ),
      )
      |> limit(size)
      |> offset(skip)
      |> all(ctx.db)
    }
  }
  task.map(work, fn(rows) {
    json.array(rows, fn(r) {
      json.object([
        #("upload", user_uploads.to_json(r.0.0)),
        #("track", tracks.to_json(r.0.1)),
        #("albumReleaseDate", json.nullable(r.1.0, json.string)),
        #("albumYear", json.nullable(r.1.1, json.int)),
      ])
    })
  })
}

pub fn albums(ctx: Context, user_id: String, size: Int, skip: Int, search) {
  let u = up.table()
  let t = tr.table()
  let conditions = [
    eq(up.user_id(u), user_id),
    ..case search {
      None -> []
      Some(q) -> {
        let pattern = "%" <> q <> "%"
        [
          or([
            like(lower(tr.album(t)), pattern),
            like(lower(tr.album_artist(t)), pattern),
          ]),
        ]
      }
    }
  ]
  select(
    u,
    pair(
      pair(
        field("albumArtist", tr.album_artist(t)),
        field("album", tr.album(t)),
      ),
      pair(
        pair(
          field("albumArt", max(tr.album_art(t))),
          field("albumUri", max(tr.album_uri(t))),
        ),
        pair(
          field("artistUri", max(tr.artist_uri(t))),
          field("trackCount", count_distinct(up.id(u))),
        ),
      ),
    ),
  )
  |> inner_join(t, eq_columns(up.track_id(u), tr.id(t)))
  |> where(and(conditions))
  |> group_by([reference(tr.album_artist(t)), reference(tr.album(t))])
  |> order_by([asc(tr.album(t)), asc(tr.album_artist(t))])
  |> limit(size)
  |> offset(skip)
  |> all(ctx.db)
  |> task.map(fn(rows) {
    json.array(rows, fn(r) {
      json.object([
        #("albumArtist", json.string(r.0.0)),
        #("album", json.string(r.0.1)),
        #("albumArt", json.nullable(option.flatten(r.1.0.0), json.string)),
        #("albumUri", json.nullable(option.flatten(r.1.0.1), json.string)),
        #("artistUri", json.nullable(option.flatten(r.1.1.0), json.string)),
        #("trackCount", json.int(r.1.1.1)),
      ])
    })
  })
}

pub fn artists(ctx: Context, user_id: String, size: Int, skip: Int, search) {
  let u = up.table()
  let t = tr.table()
  select(
    u,
    pair(
      pair(
        field("name", tr.album_artist(t)),
        field("artistUri", max(tr.artist_uri(t))),
      ),
      pair(
        field("trackCount", count_distinct(up.id(u))),
        field("albumCount", count_distinct(tr.album(t))),
      ),
    ),
  )
  |> inner_join(t, eq_columns(up.track_id(u), tr.id(t)))
  |> where(
    and([
      eq(up.user_id(u), user_id),
      ..case search {
        None -> []
        Some(q) -> [like(lower(tr.album_artist(t)), "%" <> q <> "%")]
      }
    ]),
  )
  |> group_by([reference(tr.album_artist(t))])
  |> order_by([asc(tr.album_artist(t))])
  |> limit(size)
  |> offset(skip)
  |> all(ctx.db)
  |> task.map(fn(rows) {
    json.array(rows, fn(r) {
      json.object([
        #("name", json.string(r.0.0)),
        #("artistUri", json.nullable(option.flatten(r.0.1), json.string)),
        #("trackCount", json.int(r.1.0)),
        #("albumCount", json.int(r.1.1)),
      ])
    })
  })
}
