import gleam/dict
import gleam/float
import gleam/int
import gleam/json
import gleam/list
import gleam/option.{Some}
import gleam/result
import rocksky_api/context.{type Context}
import rocksky_api/drizzle/orm.{
  all, and, count, desc, eq, eq_columns, field, from, group_by, in_array,
  inner_join, ne, nullable, or, order_by, reference, required, select, where,
}
import rocksky_api/drizzle/schema/artists as a
import rocksky_api/drizzle/schema/scrobbles as s
import rocksky_api/drizzle/schema/users as u
import rocksky_api/lexicon/models
import rocksky_api/lib/query_cache
import rocksky_api/node/xrpc_server
import rocksky_api/task
import rocksky_api/xrpc/auth
import rocksky_api/xrpc/handler

fn artists(ctx: Context, user: String) {
  let artists = a.table()
  let scrobbles = s.table()
  select(scrobbles, field("id", a.id(artists)))
  |> inner_join(
    artists,
    eq_columns(s.artist_id(scrobbles), nullable(a.id(artists))),
  )
  |> where(
    and([
      eq(s.user_id(scrobbles), Some(user)),
      ne(a.name(artists), "Various Artists"),
    ]),
  )
  |> group_by([reference(a.id(artists))])
  |> order_by([desc(count())])
  |> all(ctx.read_db)
}

pub fn retrieve(ctx: Context, did: String, target: String) {
  let users = u.table()
  use ids <- task.then(task.all2(
    select(users, field("id", u.id(users)))
      |> where(eq(u.did(users), did))
      |> required(ctx.read_db, "User1 not found"),
    select(users, field("id", u.id(users)))
      |> where(or([eq(u.did(users), target), eq(u.handle(users), target)]))
      |> required(ctx.read_db, "User2 not found"),
  ))
  use lists <- task.then(task.all2(artists(ctx, ids.0), artists(ctx, ids.1)))
  let ranks1 =
    list.index_map(lists.0, fn(id, i) { #(id, i + 1) }) |> dict.from_list
  let ranks2 =
    list.index_map(lists.1, fn(id, i) { #(id, i + 1) }) |> dict.from_list
  let shared = list.filter(lists.0, dict.has_key(ranks2, _))
  let n1 = list.length(lists.0)
  let n2 = list.length(lists.1)
  let shared_count = list.length(shared)
  let union = n1 + n2 - shared_count
  let percentage = case union > 0 {
    True -> int.to_float(shared_count) /. int.to_float(union) *. 100.0
    False -> 0.0
  }
  let artists = a.table()
  use details <- task.map(case shared {
    [] -> task.ok([])
    _ ->
      from(artists)
      |> where(in_array(a.id(artists), list.take(shared, 20)))
      |> all(ctx.read_db)
  })
  let details =
    list.map(details, fn(artist) {
      let rank1 = dict.get(ranks1, artist.id) |> result.unwrap(9999)
      let rank2 = dict.get(ranks2, artist.id) |> result.unwrap(9999)
      models.ActorArtistViewBasic(
        id: Some(artist.id),
        name: Some(artist.name),
        picture: artist.picture,
        uri: artist.uri,
        user1_rank: Some(rank1),
        user2_rank: Some(rank2),
        weight: Some(1.0 /. int.to_float(rank1 + rank2)),
      )
    })
    |> list.sort(fn(a, b) {
      float.compare(option.unwrap(b.weight, 0.0), option.unwrap(a.weight, 0.0))
    })
    |> list.take(10)
  models.ActorCompatibilityViewBasic(
    compatibility_level: Some(int.min(10, float.round(percentage /. 10.0))),
    compatibility_percentage: Some(
      int.to_float(float.round(percentage *. 10.0)) /. 10.0,
    ),
    shared_artists: Some(shared_count),
    top_shared_artist_names: Some(
      list.map(details, fn(a) { option.unwrap(a.name, "") }),
    ),
    top_shared_detailed_artists: Some(details),
    user1_artist_count: Some(n1),
    user2_artist_count: Some(n2),
  )
}

pub fn register(server: xrpc_server.Server, ctx: Context) {
  let cache = query_cache.new(300_000, 200)
  xrpc_server.method(
    server,
    "app.rocksky.actor.getActorCompatibility",
    Some(auth.verifier(ctx)),
    fn(req) {
      use params <- handler.query(
        req,
        handler.options("getActorCompatibility")
          |> handler.timeout(120_000)
          |> handler.on_error(
            handler.Fallback(json.object([#("compatibility", json.null())])),
          ),
        models.get_actor_compatibility_params_decoder(),
      )
      use did <- task.then(
        task.require(handler.caller(req), "User not authenticated")
        |> task.from_result,
      )
      let key = json.array([did, params.did], json.string) |> json.to_string
      use view <- task.map(
        query_cache.get(cache, key, fn() { retrieve(ctx, did, params.did) }),
      )
      json.object([
        #("compatibility", models.encode_actor_compatibility_view_basic(view)),
      ])
    },
  )
}
