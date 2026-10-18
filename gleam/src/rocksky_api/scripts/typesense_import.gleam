import gleam/list
import gleam/option.{None, Some}
import rocksky_api/context.{type Context}
import rocksky_api/db/row
import rocksky_api/drizzle/orm.{
  all, all_columns, asc, count, eq_columns, field, from, inner_join, limit,
  nested, offset, order_by, pair, required, select,
}
import rocksky_api/drizzle/schema/albums
import rocksky_api/drizzle/schema/artists
import rocksky_api/drizzle/schema/playlists
import rocksky_api/drizzle/schema/tracks
import rocksky_api/drizzle/schema/user_uploads as uploads
import rocksky_api/drizzle/schema/users
import rocksky_api/error
import rocksky_api/log
import rocksky_api/scripts/common
import rocksky_api/task
import rocksky_api/typesense/library
import rocksky_api/typesense/schema
import rocksky_api/typesense/search

pub fn import_collection(total: Int, fetch, index, start: Int) {
  case start >= total {
    True -> task.ok(Nil)
    False -> {
      use rows <- task.then(fetch(start, 500))
      case rows {
        [] -> task.ok(Nil)
        _ -> {
          use _ <- task.then(
            index(rows)
            |> task.rescue(fn(e) {
              log.warn("Index batch failed: " <> error.describe(e))
              task.ok(Nil)
            }),
          )
          import_collection(total, fetch, index, start + 500)
        }
      }
    }
  }
}

fn search_collection(ctx: Context, table, index) {
  use total <- task.then(
    select(table, field("count", count())) |> required(ctx.db, "Missing count"),
  )
  import_collection(
    total,
    fn(start, size) {
      from(table) |> limit(size) |> offset(start) |> all(ctx.db)
    },
    index,
    0,
  )
}

fn library_tracks(ctx: Context) {
  let uploads = uploads.table()
  let tracks = tracks.table()
  use total <- task.then(
    select(uploads, field("count", count()))
    |> required(ctx.db, "Missing count"),
  )
  import_collection(
    total,
    fn(start, size) {
      select(
        uploads,
        pair(
          nested("upload", all_columns(uploads)),
          nested("track", all_columns(tracks)),
        ),
      )
      |> inner_join(
        tracks,
        eq_columns(uploads.track_id(uploads), tracks.id(tracks)),
      )
      |> order_by([asc(uploads.uploaded_at(uploads))])
      |> limit(size)
      |> offset(start)
      |> all(ctx.db)
    },
    fn(rows) {
      use _ <- task.map(
        task.parallel_map(rows, fn(r) {
          let #(upload, track) = r
          library.index_library_track(
            ctx.typesense,
            library.LibraryTrackDocument(
              id: upload.id,
              user_id: upload.user_id,
              track_id: track.id,
              title: track.title,
              artist: track.artist,
              album: track.album,
              album_artist: track.album_artist,
              genre: track.genre,
              composer: track.composer,
              year: None,
              duration: track.duration,
              album_art: track.album_art,
              r2_key: upload.r2_key,
              mime_type: upload.mime_type,
              file_size: upload.file_size,
              original_filename: Some(upload.original_filename),
              uploaded_at: row.to_unix_ms(upload.uploaded_at),
              mb_id: track.mb_id,
              track_number: track.track_number,
              disc_number: track.disc_number,
            ),
          )
          |> task.rescue(fn(e) {
            log.warn("Library indexing failed: " <> error.describe(e))
            task.ok(Nil)
          })
        }),
      )
      Nil
    },
    0,
  )
}

pub fn option_value(args: List(String), name: String) {
  case args {
    [key, value, ..] if key == name -> value
    [_, ..rest] -> option_value(rest, name)
    [] -> ""
  }
}

pub fn execute(ctx: Context, args: List(String)) {
  let only = option_value(args, "--only")
  use _ <- task.then(case only != "library" {
    False -> task.ok(Nil)
    True -> {
      use _ <- task.then(case list.contains(args, "--reset") {
        True -> schema.recreate_search_collections(ctx.typesense)
        False -> schema.ensure_search_collections(ctx.typesense)
      })
      use _ <- task.then(
        search_collection(ctx, albums.table(), fn(rows) {
          search.index_albums(ctx.typesense, rows)
        }),
      )
      use _ <- task.then(
        search_collection(ctx, artists.table(), fn(rows) {
          search.index_artists(ctx.typesense, rows)
        }),
      )
      use _ <- task.then(
        search_collection(ctx, tracks.table(), fn(rows) {
          search.index_tracks(ctx.typesense, rows)
        }),
      )
      use _ <- task.then(
        search_collection(ctx, users.table(), fn(rows) {
          search.index_users(ctx.typesense, rows)
        }),
      )
      search_collection(ctx, playlists.table(), fn(rows) {
        search.index_playlists(ctx.typesense, rows)
      })
    }
  })
  case only == "library" || list.contains(args, "--library") {
    False -> task.ok(Nil)
    True -> {
      use _ <- task.then(schema.ensure_collection(ctx.typesense))
      library_tracks(ctx)
    }
  }
}

pub fn main() {
  common.run(execute)
}
