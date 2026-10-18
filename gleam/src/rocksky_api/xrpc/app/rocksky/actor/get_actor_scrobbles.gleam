import gleam/list
import gleam/option.{None, Some}
import rocksky_api/context.{type Context}
import rocksky_api/db/row
import rocksky_api/drizzle/orm.{
  all, all_columns, desc, eq, eq_columns, field, inner_join, limit, nested,
  nullable, offset, one, or, order_by, pair, select, where,
}
import rocksky_api/drizzle/schema/scrobbles as sc
import rocksky_api/drizzle/schema/tracks as t
import rocksky_api/drizzle/schema/users as u
import rocksky_api/lexicon/models
import rocksky_api/lib/track_likes
import rocksky_api/node/xrpc_server.{type Server}
import rocksky_api/task
import rocksky_api/xrpc/auth
import rocksky_api/xrpc/handler

pub fn register(server: Server, ctx: Context) -> Nil {
  let fallback =
    models.GetActorScrobblesOutput(Some([]))
    |> models.encode_get_actor_scrobbles_output
  xrpc_server.method(
    server,
    "app.rocksky.actor.getActorScrobbles",
    Some(auth.verifier(ctx)),
    fn(req) {
      use params <- handler.query(
        req,
        handler.options("getActorScrobbles")
          |> handler.timeout(120_000)
          |> handler.on_error(handler.Fallback(fallback)),
        models.get_actor_scrobbles_params_decoder(),
      )
      use scrobbles <- task.map(retrieve(ctx, params, handler.caller(req)))
      models.GetActorScrobblesOutput(Some(scrobbles))
      |> models.encode_get_actor_scrobbles_output
    },
  )
}

fn retrieve(ctx: Context, params: models.GetActorScrobblesParams, did) {
  let users = u.table()
  let scrobbles = sc.table()
  let tracks = t.table()
  use user <- task.then(
    select(users, field("id", u.id(users)))
    |> where(
      or([eq(u.did(users), params.did), eq(u.handle(users), params.did)]),
    )
    |> one(ctx.db),
  )
  case user {
    None -> task.ok([])
    Some(id) -> {
      use rows <- task.then(
        select(
          scrobbles,
          pair(
            nested("scrobble", all_columns(scrobbles)),
            pair(
              nested("track", all_columns(tracks)),
              nested("user", all_columns(users)),
            ),
          ),
        )
        |> inner_join(
          tracks,
          eq_columns(sc.track_id(scrobbles), nullable(t.id(tracks))),
        )
        |> inner_join(
          users,
          eq_columns(sc.user_id(scrobbles), nullable(u.id(users))),
        )
        |> where(eq(sc.user_id(scrobbles), Some(id)))
        |> order_by([desc(sc.timestamp(scrobbles)), desc(sc.id(scrobbles))])
        |> limit(option.unwrap(params.limit, 50))
        |> offset(option.unwrap(params.offset, 0))
        |> all(ctx.db),
      )
      use likes <- task.map(track_likes.for_track_ids(
        ctx,
        list.map(rows, fn(r) { r.1.0.id }),
        did,
      ))
      list.map(rows, fn(r) {
        let #(scrobble, #(track, user)) = r
        models.ScrobbleViewBasic(
          ..models.new_scrobble_view_basic(),
          id: Some(scrobble.id),
          track_id: Some(track.id),
          title: Some(track.title),
          artist: Some(track.artist),
          album_artist: Some(track.album_artist),
          album_art: track.album_art,
          album: Some(track.album),
          handle: Some(user.handle),
          did: Some(user.did),
          avatar: Some(user.avatar),
          uri: scrobble.uri,
          track_uri: track.uri,
          liked: Some(track_likes.get(likes, track.id).liked),
          artist_uri: track.artist_uri,
          album_uri: track.album_uri,
          created_at: Some(row.iso8601(scrobble.timestamp)),
        )
      })
    }
  }
}
