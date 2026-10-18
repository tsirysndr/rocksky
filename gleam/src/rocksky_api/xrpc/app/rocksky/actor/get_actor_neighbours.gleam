import gleam/int
import gleam/json
import gleam/list
import gleam/option.{type Option, None}
import rocksky_api/context.{type Context}
import rocksky_api/db/db
import rocksky_api/drizzle/orm.{
  all, count, eq, field, or, required, select, where,
}
import rocksky_api/drizzle/schema/users as u
import rocksky_api/lexicon/models
import rocksky_api/lib/query_cache
import rocksky_api/node/xrpc_server
import rocksky_api/schema/artists
import rocksky_api/schema/users
import rocksky_api/task
import rocksky_api/xrpc/app/rocksky/actor/neighbours_query
import rocksky_api/xrpc/handler

pub type Neighbour {
  Neighbour(
    user: users.User,
    shared_count: Int,
    similarity: Float,
    artists: List(artists.Artist),
  )
}

pub fn encode(neighbour: Neighbour) {
  let u = neighbour.user
  json.object([
    #("id", json.string(u.id)),
    #("userId", json.string(u.id)),
    #("did", json.string(u.did)),
    #("handle", json.string(u.handle)),
    #("displayName", json.string(u.display_name)),
    #("avatar", json.string(u.avatar)),
    #("sharedArtistsCount", json.int(neighbour.shared_count)),
    #("similarityScore", json.float(neighbour.similarity)),
    #(
      "topSharedArtistNames",
      json.array(neighbour.artists, fn(a) { json.string(a.name) }),
    ),
    #(
      "topSharedArtistsDetails",
      json.array(neighbour.artists, fn(a) {
        json.object([
          #("id", json.string(a.id)),
          #("name", json.string(a.name)),
          #("picture", json.nullable(a.picture, json.string)),
          #("uri", json.nullable(a.uri, json.string)),
        ])
      }),
    ),
  ])
}

fn group(
  rows: List(#(users.User, #(Int, Option(artists.Artist)))),
  total: Int,
  acc: List(Neighbour),
) {
  case rows {
    [] -> list.reverse(acc)
    [#(user, #(count, _)), ..] -> {
      let #(current, rest) = list.split_while(rows, fn(r) { r.0.id == user.id })
      let artists =
        list.filter_map(current, fn(r) { option.to_result(r.1.1, Nil) })
      let similarity = case total > 0 {
        True -> int.to_float(count) /. int.to_float(total)
        False -> 0.0
      }
      group(rest, total, [Neighbour(user, count, similarity, artists), ..acc])
    }
  }
}

pub fn retrieve(ctx: Context, actor: String) {
  db.query_with_timeout(
    ctx.read_db,
    "Failed to retrieve neighbours",
    120_000,
    fn(db) {
      let users = u.table()
      use id <- task.then(
        select(users, field("id", u.id(users)))
        |> where(or([eq(u.did(users), actor), eq(u.handle(users), actor)]))
        |> required(db, "User not found"),
      )
      let target = neighbours_query.target(id)
      use rows <- task.map(task.all2(
        neighbours_query.query(id) |> all(db),
        select(target, field("count", count()))
          |> required(db, "Artist count missing"),
      ))
      group(rows.0, rows.1, [])
    },
  )
}

pub fn register(server: xrpc_server.Server, ctx: Context) {
  let cache = query_cache.new(600_000, 100)
  xrpc_server.method(
    server,
    "app.rocksky.actor.getActorNeighbours",
    None,
    fn(req) {
      use params <- handler.query(
        req,
        handler.options("getActorNeighbours")
          |> handler.timeout(120_000)
          |> handler.on_error(
            handler.Fallback(
              json.object([#("neighbours", json.array([], encode))]),
            ),
          ),
        models.get_actor_neighbours_params_decoder(),
      )
      use rows <- task.map(
        query_cache.get(cache, params.did, fn() { retrieve(ctx, params.did) }),
      )
      json.object([#("neighbours", json.array(rows, encode))])
    },
  )
}
