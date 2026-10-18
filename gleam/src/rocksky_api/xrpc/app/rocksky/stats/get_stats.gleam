import gleam/option.{None, Some}
import rocksky_api/context.{type Context}
import rocksky_api/drizzle/orm.{
  count, count_distinct, eq, field, one, or, pair, select, where,
}
import rocksky_api/drizzle/schema/loved_tracks as lt
import rocksky_api/drizzle/schema/scrobbles as s
import rocksky_api/drizzle/schema/users as u
import rocksky_api/lexicon/models
import rocksky_api/lib/stats_cache
import rocksky_api/node/xrpc_server.{type Server}
import rocksky_api/task
import rocksky_api/xrpc/handler

pub fn register(server: Server, ctx: Context) -> Nil {
  xrpc_server.method(server, "app.rocksky.stats.getStats", None, fn(req) {
    use params <- handler.query(
      req,
      handler.options("getStats")
        |> handler.timeout(120_000)
        |> handler.on_error(handler.Propagate),
      models.get_stats_params_decoder(),
    )
    use stats <- task.map(retrieve(ctx, params.did))
    models.StatsView(
      Some(stats.scrobbles),
      Some(stats.artists),
      Some(stats.loved_tracks),
      Some(stats.albums),
      Some(stats.tracks),
    )
    |> models.encode_stats_view
  })
}

fn retrieve(ctx: Context, actor: String) {
  use cached <- task.then(stats_cache.read(ctx, actor))
  case cached {
    Some(stats) -> task.ok(stats)
    None -> {
      let users = u.table()
      use user <- task.then(
        select(users, field("id", u.id(users)))
        |> where(or([eq(u.did(users), actor), eq(u.handle(users), actor)]))
        |> one(ctx.db),
      )
      case user {
        None -> task.ok(stats_cache.Stats(0, 0, 0, 0, 0))
        Some(id) -> {
          let scrobbles = s.table()
          let loved = lt.table()
          use data <- task.then(task.all2(
            select(
              scrobbles,
              pair(
                pair(
                  field("plays", count()),
                  field("artists", count_distinct(s.artist_id(scrobbles))),
                ),
                pair(
                  field("albums", count_distinct(s.album_id(scrobbles))),
                  field("tracks", count_distinct(s.track_id(scrobbles))),
                ),
              ),
            )
              |> where(eq(s.user_id(scrobbles), Some(id)))
              |> one(ctx.read_db),
            select(loved, field("count", count()))
              |> where(eq(lt.user_id(loved), id))
              |> one(ctx.db),
          ))
          let counts = option.unwrap(data.0, #(#(0, 0), #(0, 0)))
          let stats =
            stats_cache.Stats(
              counts.0.0,
              counts.0.1,
              option.unwrap(data.1, 0),
              counts.1.0,
              counts.1.1,
            )
          use _ <- task.map(stats_cache.write(ctx, actor, stats))
          stats
        }
      }
    }
  }
}
