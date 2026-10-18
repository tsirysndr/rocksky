import gleam/dynamic/decode
import gleam/int
import gleam/json
import gleam/list
import gleam/option.{None, Some}
import gleam/result
import rocksky_api/context.{type Context}
import rocksky_api/db/row
import rocksky_api/drizzle/orm.{eq, from, one, or, run, set, update, where}
import rocksky_api/drizzle/schema/users as us
import rocksky_api/error
import rocksky_api/lexicon/json_value
import rocksky_api/lib/agent
import rocksky_api/lib/auth
import rocksky_api/lib/bsky_profile
import rocksky_api/lib/id_resolver
import rocksky_api/lib/respond
import rocksky_api/node/axios
import rocksky_api/node/hono
import rocksky_api/node/js
import rocksky_api/node/nats
import rocksky_api/schema/users
import rocksky_api/task
import rocksky_api/users/catalog
import rocksky_api/users/json_object
import rocksky_api/users/mutations
import rocksky_api/users/shout_reads

pub fn record_uri(c: hono.Context, kind: String) {
  "at://"
  <> hono.param(c, "did")
  <> "/app.rocksky."
  <> kind
  <> "/"
  <> hono.param(c, "rkey")
}

pub fn number(c: hono.Context, name: String, fallback: Int) {
  case
    hono.query(c, name)
    |> option.then(fn(v) { int.parse(v) |> option.from_result })
  {
    None | Some(0) -> fallback
    Some(v) -> v
  }
}

fn analytics(ctx: Context, c: hono.Context, method: String, tags: Bool) {
  let body =
    json.object([
      #("user_did", json.string(hono.param(c, "did"))),
      #(
        "pagination",
        json.object([
          #("skip", json.int(number(c, "offset", 0))),
          #("take", json.int(number(c, "size", 10))),
        ]),
      ),
    ])
  let work = {
    use response <- task.then(
      axios.post(ctx.analytics, method, body, axios.default_options())
      |> task.attempt_result,
    )
    case tags {
      False -> task.ok(row.dynamic_to_json(response.data))
      True -> {
        use entries <- task.map(
          decode.run(response.data, decode.list(json_value.decoder()))
          |> error.decode("Analytics library", _)
          |> task.from_result,
        )
        json.array(entries, fn(entry) {
          json_object.extend(json_value.encode(entry), [
            #("tags", json.array([], json.string)),
          ])
        })
      }
    }
  }
  respond.json(c, work)
}

fn profile(ctx: Context, c: hono.Context) {
  let did = hono.param(c, "did")
  let work = {
    use caller <- task.then(auth.optional_did(ctx, c))
    use _ <- task.then(case caller {
      None -> task.ok(Nil)
      Some(caller) -> {
        use agent <- task.then(agent.create(ctx, caller))
        case agent {
          None -> task.ok(Nil)
          Some(agent) -> {
            use handle <- task.then(id_resolver.resolve_did_to_handle(
              ctx.resolver,
              did,
            ))
            use profile <- task.then(bsky_profile.fetch(
              ctx.env.bsky_appview_url,
              did,
              Some(agent),
            ))
            let users = us.table()
            use _ <- task.then(
              update(
                users,
                [
                  set(us.handle(users), handle),
                  ..list.append(
                    case profile.display_name {
                      None -> []
                      Some(v) -> [set(us.display_name(users), Some(v))]
                    },
                    case profile.avatar {
                      None -> []
                      Some(v) -> [set(us.avatar(users), v)]
                    },
                  )
                ],
                eq(us.did(users), did),
              )
              |> run(ctx.db),
            )
            use updated <- task.map(
              from(users) |> where(eq(us.did(users), did)) |> one(ctx.db),
            )
            case updated {
              None -> Nil
              Some(user) ->
                nats.publish(
                  ctx.nc,
                  "rocksky.user",
                  users.to_json(user) |> json.to_string,
                )
            }
          }
        }
      }
    })
    let users = us.table()
    from(users)
    |> where(or([eq(us.did(users), did), eq(us.handle(users), did)]))
    |> one(ctx.db)
    |> task.require_task("User not found")
    |> task.map(users.to_json)
  }
  respond.json(c, work)
}

pub fn app(ctx: Context) {
  hono.new()
  |> hono.get("/:did/likes", fn(c) {
    respond.json(
      c,
      catalog.likes(
        ctx,
        hono.param(c, "did"),
        number(c, "size", 10),
        number(c, "offset", 0),
      ),
    )
  })
  |> hono.get("/:did/scrobbles", analytics(
    ctx,
    _,
    "library.getScrobbles",
    False,
  ))
  |> hono.get("/:did/albums", analytics(ctx, _, "library.getTopAlbums", True))
  |> hono.get("/:did/artists", analytics(ctx, _, "library.getTopArtists", True))
  |> hono.get("/:did/tracks", analytics(ctx, _, "library.getTopTracks", True))
  |> hono.get("/:did/playlists", fn(c) {
    respond.json(
      c,
      catalog.playlists(
        ctx,
        hono.param(c, "did"),
        number(c, "size", 10),
        number(c, "offset", 0),
      ),
    )
  })
  |> hono.get("/:did/app.rocksky.scrobble/:rkey", fn(c) {
    respond.json(c, catalog.scrobble(ctx, record_uri(c, "scrobble")))
  })
  |> hono.get("/:did/app.rocksky.artist/:rkey", fn(c) {
    respond.json(c, catalog.artist(ctx, record_uri(c, "artist")))
  })
  |> hono.get("/:did/app.rocksky.album/:rkey", fn(c) {
    respond.json(c, catalog.album(ctx, record_uri(c, "album")))
  })
  |> hono.get("/:did/app.rocksky.song/:rkey", fn(c) {
    respond.json(c, catalog.song(ctx, record_uri(c, "song")))
  })
  |> hono.get("/:did/app.rocksky.artist/:rkey/tracks", fn(c) {
    respond.json(
      c,
      catalog.artist_tracks(
        ctx,
        record_uri(c, "artist"),
        number(c, "size", 10),
        number(c, "offset", 0),
      ),
    )
  })
  |> hono.get("/:did/app.rocksky.artist/:rkey/albums", fn(c) {
    respond.json(
      c,
      catalog.artist_albums(
        ctx,
        record_uri(c, "artist"),
        number(c, "size", 10),
        number(c, "offset", 0),
      ),
    )
  })
  |> hono.get("/:did/app.rocksky.playlist/:rkey", fn(c) {
    let work = {
      use did <- task.then(
        auth.optional_did(ctx, c) |> task.rescue(fn(_) { task.ok(None) }),
      )
      catalog.playlist(ctx, record_uri(c, "playlist"), did)
    }
    respond.json(c, work)
  })
  |> hono.get("/:did/stats", fn(c) {
    let work = {
      use response <- task.map(
        axios.post(
          ctx.analytics,
          "library.getStats",
          json.object([#("user_did", json.string(hono.param(c, "did")))]),
          axios.default_options(),
        )
        |> task.attempt_result,
      )
      let object = js.entries(response.data)
      json.object(
        list.filter_map(
          [
            #("scrobbles", "scrobbles"),
            #("artists", "artists"),
            #("lovedTracks", "loved_tracks"),
            #("albums", "albums"),
            #("tracks", "tracks"),
          ],
          fn(key) {
            list.key_find(object, key.1)
            |> result.map(fn(value) { #(key.0, row.dynamic_to_json(value)) })
          },
        ),
      )
    }
    respond.json(c, work)
  })
  |> hono.get("/:did", profile(ctx, _))
  |> mutations.routes(ctx)
  |> shout_reads.routes(ctx)
}
