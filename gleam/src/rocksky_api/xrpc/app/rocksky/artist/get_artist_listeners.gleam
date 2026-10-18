import gleam/dict
import gleam/json
import gleam/list
import gleam/option.{None, Some}
import rocksky_api/context.{type Context}
import rocksky_api/drizzle/orm.{
  all, and, count_column, desc, eq, eq_columns, field, group_by, in_array,
  inner_join, limit as db_limit, nullable, offset as db_offset, one, order_by,
  pair, reference, select, where,
}
import rocksky_api/drizzle/schema/artists as a
import rocksky_api/drizzle/schema/scrobbles as sc
import rocksky_api/drizzle/schema/tracks as t
import rocksky_api/drizzle/schema/users as u
import rocksky_api/lexicon/models
import rocksky_api/lib/query_cache
import rocksky_api/node/xrpc_server.{type Server}
import rocksky_api/task
import rocksky_api/xrpc/handler

pub fn register(server: Server, ctx: Context) -> Nil {
  let cache = query_cache.new(300_000, 200)
  let fallback =
    models.GetArtistListenersOutput(Some([]))
    |> models.encode_get_artist_listeners_output
  xrpc_server.method(
    server,
    "app.rocksky.artist.getArtistListeners",
    None,
    fn(req) {
      use params <- handler.query(
        req,
        handler.options("getArtistListeners")
          |> handler.on_error(handler.Fallback(fallback)),
        models.get_artist_listeners_params_decoder(),
      )
      use listeners <- task.map(
        query_cache.get(
          cache,
          models.encode_get_artist_listeners_params(params) |> json.to_string,
          fn() { retrieve(ctx, params) },
        ),
      )
      models.GetArtistListenersOutput(Some(listeners))
      |> models.encode_get_artist_listeners_output
    },
  )
}

fn retrieve(ctx: Context, params: models.GetArtistListenersParams) {
  let artists = a.table()
  let users = u.table()
  let tracks = t.table()
  let scrobbles = sc.table()
  use artist <- task.then(
    select(artists, field("id", a.id(artists)))
    |> where(eq(a.uri(artists), Some(params.uri)))
    |> one(ctx.read_db),
  )
  case artist {
    None -> task.ok([])
    Some(id) -> {
      let limit = option.unwrap(params.limit, 100)
      let offset = option.unwrap(params.offset, 0)
      use ranked <- task.then(
        select(
          scrobbles,
          pair(
            field("user_id", sc.user_id(scrobbles)),
            field("plays", count_column(sc.id(scrobbles))),
          ),
        )
        |> where(eq(sc.artist_id(scrobbles), Some(id)))
        |> group_by([reference(sc.user_id(scrobbles))])
        |> order_by([desc(count_column(sc.id(scrobbles)))])
        |> db_limit(limit)
        |> db_offset(offset)
        |> all(ctx.read_db),
      )
      case ranked {
        [] -> task.ok([])
        _ -> {
          let ids =
            list.filter_map(ranked, fn(r) { option.to_result(r.0, Nil) })
          use #(users, plays) <- task.map(task.all2(
            select(
              users,
              pair(
                pair(field("id", u.id(users)), field("did", u.did(users))),
                pair(
                  field("handle", u.handle(users)),
                  pair(
                    field("name", u.display_name(users)),
                    field("avatar", u.avatar(users)),
                  ),
                ),
              ),
            )
              |> where(in_array(u.id(users), ids))
              |> all(ctx.read_db),
            select(
              scrobbles,
              pair(
                field("user_id", sc.user_id(scrobbles)),
                pair(
                  field("title", t.title(tracks)),
                  pair(
                    field("uri", t.uri(tracks)),
                    field("plays", count_column(sc.id(scrobbles))),
                  ),
                ),
              ),
            )
              |> inner_join(
                tracks,
                eq_columns(sc.track_id(scrobbles), nullable(t.id(tracks))),
              )
              |> where(
                and([
                  eq(sc.artist_id(scrobbles), Some(id)),
                  in_array(sc.user_id(scrobbles), list.map(ids, Some)),
                ]),
              )
              |> group_by([
                reference(sc.user_id(scrobbles)),
                reference(t.id(tracks)),
                reference(t.title(tracks)),
                reference(t.uri(tracks)),
              ])
              |> all(ctx.read_db),
          ))
          let user_map =
            users |> list.map(fn(v) { #(v.0.0, v) }) |> dict.from_list
          let best =
            list.fold(
              plays,
              dict.new(),
              fn(
                acc: dict.Dict(String, #(String, #(option.Option(String), Int))),
                play,
              ) {
                case play.0 {
                  None | Some("") -> acc
                  Some(id) ->
                    case dict.get(acc, id) {
                      Ok(current) if current.1.1 >= play.1.1.1 -> acc
                      _ -> dict.insert(acc, id, play.1)
                    }
                }
              },
            )
          ranked
          |> list.index_map(fn(item, index) {
            use id <- result_try(option.to_result(item.0, Nil))
            use user <- result_try(dict.get(user_map, id))
            let most = dict.get(best, id) |> option.from_result
            Ok(models.ArtistListenerViewBasic(
              Some(id),
              Some(user.0.1),
              Some(user.1.0),
              user.1.1.0,
              Some(user.1.1.1),
              Some(models.ArtistSongViewBasic(
                title: Some(
                  option.map(most, fn(v) { v.0 }) |> option.unwrap(""),
                ),
                uri: Some(
                  option.then(most, fn(v) { v.1.0 }) |> option.unwrap(""),
                ),
                play_count: Some(
                  option.map(most, fn(v) { v.1.1 }) |> option.unwrap(0),
                ),
              )),
              Some(item.1),
              Some(offset + index + 1),
            ))
          })
          |> list.filter_map(fn(r) { r })
        }
      }
    }
  }
}

fn result_try(r: Result(a, Nil), next: fn(a) -> Result(b, Nil)) {
  case r {
    Ok(v) -> next(v)
    Error(e) -> Error(e)
  }
}
