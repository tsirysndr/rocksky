import gleam/option.{None, Some}
import rocksky_api/context.{type Context}
import rocksky_api/drizzle/orm.{count as db_count, field, required, select}
import rocksky_api/drizzle/schema/albums
import rocksky_api/drizzle/schema/artists
import rocksky_api/drizzle/schema/scrobbles
import rocksky_api/drizzle/schema/tracks
import rocksky_api/drizzle/schema/users
import rocksky_api/lexicon/models
import rocksky_api/node/xrpc_server.{type Server}
import rocksky_api/task
import rocksky_api/xrpc/handler

pub fn register(server: Server, ctx: Context) -> Nil {
  let fallback =
    models.StatsGlobalStatsView(Some(0), Some(0), Some(0), Some(0), Some(0))
    |> models.encode_stats_global_stats_view
  xrpc_server.method(server, "app.rocksky.stats.getGlobalStats", None, fn(_) {
    use <- handler.run(
      handler.options("getGlobalStats")
      |> handler.timeout(120_000)
      |> handler.on_error(handler.Fallback(fallback)),
    )
    use #(scrobbles, users, artists, #(albums, tracks)) <- task.map(task.all4(
      count(ctx, scrobbles.table()),
      count(ctx, users.table()),
      count(ctx, artists.table()),
      task.all2(count(ctx, albums.table()), count(ctx, tracks.table())),
    ))
    models.StatsGlobalStatsView(
      Some(scrobbles),
      Some(users),
      Some(artists),
      Some(albums),
      Some(tracks),
    )
    |> models.encode_stats_global_stats_view
  })
}

fn count(ctx: Context, table) {
  select(table, field("count", db_count()))
  |> required(ctx.read_db, "Missing global count")
}
