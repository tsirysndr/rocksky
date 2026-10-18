import gleam/list
import gleam/option.{None, Some}
import rocksky_api/context.{type Context}
import rocksky_api/drizzle/orm.{
  all, all_columns, asc, count, eq, eq_columns, field, left_join, nested,
  nullable, optional_selection, order_by, pair, required, select, where,
}
import rocksky_api/drizzle/schema/album_tracks as at
import rocksky_api/drizzle/schema/albums
import rocksky_api/drizzle/schema/artists
import rocksky_api/drizzle/schema/discogs_releases
import rocksky_api/drizzle/schema/scrobbles as sc
import rocksky_api/drizzle/schema/tracks
import rocksky_api/drizzle/schema/user_albums as ua
import rocksky_api/lexicon/models
import rocksky_api/lib/discogs_view
import rocksky_api/lib/track_likes
import rocksky_api/node/xrpc_server.{type Server}
import rocksky_api/task
import rocksky_api/views/album
import rocksky_api/views/song
import rocksky_api/xrpc/auth
import rocksky_api/xrpc/handler

pub fn register(server: Server, ctx: Context) -> Nil {
  xrpc_server.method(
    server,
    "app.rocksky.album.getAlbum",
    Some(auth.verifier(ctx)),
    fn(req) {
      use params <- handler.query(
        req,
        handler.options("getAlbum")
          |> handler.timeout(120_000)
          |> handler.on_error(handler.FallbackExceptRequest(
            models.new_album_view_detailed()
            |> models.encode_album_view_detailed,
          )),
        models.album_get_album_params_decoder(),
      )
      use output <- task.map(retrieve(ctx, params.uri, handler.caller(req)))
      models.encode_album_view_detailed(output)
    },
  )
}

fn retrieve(ctx: Context, uri: String, did) {
  let a_table = albums.table()
  let ar = artists.table()
  let d = discogs_releases.table()
  let t = tracks.table()
  let links = at.table()
  let users = ua.table()
  let scrobbles = sc.table()
  use #(a, #(artist, discogs)) <- task.then(
    select(
      a_table,
      pair(
        nested("album", all_columns(a_table)),
        pair(
          nested("artist", optional_selection(all_columns(ar))),
          nested("discogs", optional_selection(all_columns(d))),
        ),
      ),
    )
    |> left_join(ar, eq_columns(albums.artist_uri(a_table), artists.uri(ar)))
    |> left_join(
      d,
      eq_columns(
        albums.discogs_release_id(a_table),
        nullable(discogs_releases.id(d)),
      ),
    )
    |> where(eq(albums.uri(a_table), Some(uri)))
    |> required(ctx.read_db, "Album not found: " <> uri),
  )
  use #(songs, listeners, plays, discogs) <- task.then(
    task.all4(
      select(links, nested("track", optional_selection(all_columns(t))))
        |> left_join(t, eq_columns(at.track_id(links), tracks.id(t)))
        |> where(eq(at.album_id(links), a.id))
        |> order_by([asc(tracks.disc_number(t)), asc(tracks.track_number(t))])
        |> all(ctx.read_db)
        |> task.map(fn(rows) {
          list.filter_map(rows, option.to_result(_, Nil)) |> song.dedupe
        }),
      select(users, field("count", count()))
        |> where(eq(ua.album_id(users), a.id))
        |> required(ctx.read_db, "Missing count"),
      select(scrobbles, field("count", count()))
        |> where(eq(sc.album_id(scrobbles), Some(a.id)))
        |> required(ctx.read_db, "Missing count"),
      case discogs {
        None -> task.ok(None)
        Some(d) -> discogs_view.retrieve(ctx, d) |> task.map(Some)
      },
    ),
  )
  use likes <- task.map(track_likes.for_track_ids(
    ctx,
    list.map(songs, fn(t) { t.id }),
    did,
  ))
  let songs =
    list.map(songs, fn(t) {
      let likes = track_likes.get(likes, t.id)
      models.SongViewBasic(
        ..song.basic(t),
        liked: Some(likes.liked),
        likes_count: Some(likes.likes_count),
      )
    })
  models.AlbumViewDetailed(
    ..album.detailed(a),
    tags: Some(option.then(artist, fn(a) { a.genres }) |> option.unwrap([])),
    tracks: Some(songs),
    play_count: Some(plays),
    unique_listeners: Some(listeners),
    discogs: discogs,
  )
}
