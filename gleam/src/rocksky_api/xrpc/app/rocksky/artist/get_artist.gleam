import gleam/option.{None, Some}
import rocksky_api/context.{type Context}
import rocksky_api/drizzle/orm.{
  all_columns, count, eq, eq_columns, field, left_join, or, required, select,
  where,
}
import rocksky_api/drizzle/schema/artists
import rocksky_api/drizzle/schema/scrobbles as sc
import rocksky_api/drizzle/schema/user_artists as ua
import rocksky_api/lexicon/models
import rocksky_api/node/xrpc_server.{type Server}
import rocksky_api/task
import rocksky_api/views/artist
import rocksky_api/xrpc/handler

pub fn register(server: Server, ctx: Context) -> Nil {
  xrpc_server.method(server, "app.rocksky.artist.getArtist", None, fn(req) {
    use params <- handler.query(
      req,
      handler.options("getArtist")
        |> handler.on_error(handler.FallbackExceptRequest(
          models.new_artist_view_detailed()
          |> models.encode_artist_view_detailed,
        )),
      models.artist_get_artist_params_decoder(),
    )
    use output <- task.map(retrieve(ctx, params.uri))
    models.encode_artist_view_detailed(output)
  })
}

fn retrieve(ctx: Context, uri: String) {
  let artists_table = artists.table()
  let users = ua.table()
  let scrobbles = sc.table()
  use a <- task.then(
    select(users, all_columns(artists_table))
    |> left_join(
      artists_table,
      eq_columns(ua.artist_id(users), artists.id(artists_table)),
    )
    |> where(
      or([
        eq(ua.uri(users), Some(uri)),
        eq(artists.uri(artists_table), Some(uri)),
      ]),
    )
    |> required(ctx.read_db, "Artist not found: " <> uri),
  )
  use #(listeners, plays) <- task.map(task.all2(
    select(users, field("count", count()))
      |> where(eq(ua.artist_id(users), a.id))
      |> required(ctx.read_db, "Missing count"),
    select(scrobbles, field("count", count()))
      |> where(eq(sc.artist_id(scrobbles), Some(a.id)))
      |> required(ctx.read_db, "Missing count"),
  ))
  models.ArtistViewDetailed(
    ..artist.detailed(a),
    unique_listeners: Some(listeners),
    play_count: Some(plays),
  )
}
