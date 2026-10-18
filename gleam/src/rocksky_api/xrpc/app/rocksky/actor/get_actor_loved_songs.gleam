import gleam/list
import gleam/option.{None, Some}
import rocksky_api/context.{type Context}
import rocksky_api/db/row
import rocksky_api/drizzle/orm.{
  all, all_columns, and, desc, eq, eq_columns, field, is_not_null, left_join,
  limit, nested, offset, or, order_by, pair, select, where,
}
import rocksky_api/drizzle/schema/loved_tracks as lt
import rocksky_api/drizzle/schema/tracks as t
import rocksky_api/drizzle/schema/users as u
import rocksky_api/lexicon/models
import rocksky_api/node/xrpc_server.{type Server}
import rocksky_api/task
import rocksky_api/views/song
import rocksky_api/xrpc/handler

pub fn register(server: Server, ctx: Context) -> Nil {
  let fallback =
    models.GetActorLovedSongsOutput(Some([]))
    |> models.encode_get_actor_loved_songs_output
  xrpc_server.method(
    server,
    "app.rocksky.actor.getActorLovedSongs",
    None,
    fn(req) {
      use params <- handler.query(
        req,
        handler.options("getActorLovedSongs")
          |> handler.timeout(120_000)
          |> handler.on_error(handler.Fallback(fallback)),
        models.get_actor_loved_songs_params_decoder(),
      )
      let likes = lt.table()
      let tracks = t.table()
      let users = u.table()
      use rows <- task.map(
        select(
          likes,
          pair(
            nested("track", all_columns(tracks)),
            field("created", lt.created_at(likes)),
          ),
        )
        |> left_join(tracks, eq_columns(lt.track_id(likes), t.id(tracks)))
        |> left_join(users, eq_columns(lt.user_id(likes), u.id(users)))
        |> where(
          and([
            or([eq(u.did(users), params.did), eq(u.handle(users), params.did)]),
            is_not_null(lt.uri(likes)),
          ]),
        )
        |> order_by([desc(lt.created_at(likes))])
        |> limit(option.unwrap(params.limit, 10))
        |> offset(option.unwrap(params.offset, 0))
        |> all(ctx.db),
      )
      models.GetActorLovedSongsOutput(
        Some(
          list.map(rows, fn(r) {
            models.SongViewBasic(
              ..song.basic(r.0),
              lyrics: r.0.lyrics,
              created_at: Some(row.iso8601(r.1)),
            )
          }),
        ),
      )
      |> models.encode_get_actor_loved_songs_output
    },
  )
}
