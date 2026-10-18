import gleam/list
import gleam/option.{None, Some}
import rocksky_api/context.{type Context}
import rocksky_api/drizzle/orm.{
  all, all_columns, asc, eq, eq_columns, left_join, nested, optional_selection,
  order_by, select, where,
}
import rocksky_api/drizzle/schema/album_tracks as at
import rocksky_api/drizzle/schema/albums as a
import rocksky_api/drizzle/schema/tracks
import rocksky_api/drizzle/schema/user_albums as ua
import rocksky_api/lexicon/models
import rocksky_api/node/xrpc_server.{type Server}
import rocksky_api/task
import rocksky_api/views/song
import rocksky_api/xrpc/handler

pub fn register(server: Server, ctx: Context) -> Nil {
  xrpc_server.method(server, "app.rocksky.album.getAlbumTracks", None, fn(req) {
    use params <- handler.query(
      req,
      handler.options("getAlbumTracks") |> handler.timeout(120_000),
      models.get_album_tracks_params_decoder(),
    )
    let links = at.table()
    let t = tracks.table()
    let albums = a.table()
    let users = ua.table()
    use rows <- task.map(
      select(links, nested("track", optional_selection(all_columns(t))))
      |> left_join(t, eq_columns(at.track_id(links), tracks.id(t)))
      |> left_join(albums, eq_columns(at.album_id(links), a.id(albums)))
      |> left_join(users, eq_columns(a.id(albums), ua.album_id(users)))
      |> where(eq(ua.uri(users), Some(params.uri)))
      |> order_by([asc(tracks.disc_number(t)), asc(tracks.track_number(t))])
      |> all(ctx.read_db),
    )
    let tracks =
      list.filter_map(rows, option.to_result(_, Nil))
      |> song.dedupe
      |> list.map(song.basic)
    models.GetAlbumTracksOutput(tracks: Some(tracks))
    |> models.encode_get_album_tracks_output
  })
}
