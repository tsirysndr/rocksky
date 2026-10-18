import gleam/dynamic/decode
import gleam/javascript/promise
import gleam/json
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/result
import gleam/string
import rocksky_api/atproto/agent as atproto
import rocksky_api/atproto/identity
import rocksky_api/atproto/oauth
import rocksky_api/auth/store
import rocksky_api/context.{type Context}
import rocksky_api/db/row
import rocksky_api/drizzle/orm.{
  all, and, desc, eq, from, insert, limit, one, order_by, run, set, update,
  where,
}
import rocksky_api/drizzle/schema/spotify_accounts as sa
import rocksky_api/drizzle/schema/spotify_tokens as st
import rocksky_api/drizzle/schema/users as u
import rocksky_api/error
import rocksky_api/kv
import rocksky_api/lib/agent
import rocksky_api/lib/auth
import rocksky_api/lib/bsky_profile
import rocksky_api/lib/helpers
import rocksky_api/lib/id_resolver
import rocksky_api/lib/respond
import rocksky_api/log
import rocksky_api/node/hono
import rocksky_api/node/js
import rocksky_api/node/jwt
import rocksky_api/node/nats
import rocksky_api/schema/spotify_accounts
import rocksky_api/schema/users as user_rows
import rocksky_api/task
import rocksky_api/telemetry/metrics

fn token(ctx: Context, did: String, cli: Bool) {
  jwt.sign(
    json.object([
      #("did", json.string(did)),
      #(
        "exp",
        json.int(
          js.now_ms()
          / 1000
          + case cli {
            True -> 86_400 * 365 * 1000
            False -> 86_400 * 7
          },
        ),
      ),
    ]),
    ctx.env.jwt_secret,
    None,
  )
}

fn optional(name, value, encode) {
  case value {
    None -> []
    Some(v) -> [#(name, encode(v))]
  }
}

fn authorize(ctx: Context, handle: String, prompt: Option(String), cli: Bool) {
  use url <- task.map(
    oauth.authorize(
      ctx.oauth_client,
      case helpers.non_empty(prompt) {
        Some(_) -> ctx.env.rocksky_signup_pds
        None -> handle
      },
      context.scope_string(),
      prompt,
    )
    |> task.attempt_result,
  )
  case cli {
    True -> kv.memory_set(ctx.kv, "cli:" <> handle, "1")
    False -> Nil
  }
  url
}

pub fn password_login(ctx: Context, handle: String, password: String) {
  use did <- task.then(
    atproto.resolve_handle(atproto.atp_agent("https://bsky.social"), handle)
    |> task.attempt_result,
  )
  use pds <- task.then(agent.pds_for(ctx, did))
  let agent = atproto.atp_agent(pds)
  use _ <- task.then(
    atproto.login(agent, handle, password) |> task.attempt_result,
  )
  use _ <- task.map(store.put_session(
    ctx.sqlite,
    "atp:" <> did,
    js.stringify(atproto.session(agent)),
  ))
  "jwt:" <> token(ctx, did, False)
}

fn callback(ctx: Context, c: hono.Context) {
  let query = case string.split(hono.url(c), "?") {
    [_, query, ..] -> query
    _ -> ""
  }
  let work = {
    use session <- task.then(
      oauth.callback(ctx.oauth_client, query) |> task.attempt_result,
    )
    let did = oauth.session_did(session)
    use handle <- task.map(id_resolver.resolve_did_to_handle(ctx.resolver, did))
    let cli = kv.memory_get(ctx.kv, "cli:" <> handle)
    kv.memory_delete(ctx.kv, "cli:" <> handle)
    kv.memory_set(ctx.kv, did, token(ctx, did, option.is_some(cli)))
    #(did, cli)
  }
  use outcome <- promise.await(work)
  case outcome {
    Error(e) -> {
      log.error("oauth callback failed: " <> error.describe(e))
      promise.resolve(hono.redirect(c, ctx.env.frontend_url <> "?error=1"))
    }
    Ok(#(did, cli)) -> {
      let accounts = sa.table()
      use response <- promise.map(
        from(accounts)
        |> where(
          and([
            eq(sa.user_id(accounts), did),
            eq(sa.is_beta_user(accounts), True),
          ]),
        )
        |> one(ctx.db),
      )
      case response {
        Error(e) -> respond.error(c, e)
        Ok(account) -> {
          case account {
            Some(a) if a.email != "" ->
              nats.publish(ctx.nc, "rocksky.spotify.user", a.email)
            _ -> Nil
          }
          hono.redirect(
            c,
            ctx.env.frontend_url
              <> "?did="
              <> did
              <> case cli {
              None -> ""
              Some(v) -> "&cli=" <> v
            },
          )
        }
      }
    }
  }
}

pub fn profile(
  ctx: Context,
  did: String,
  factory: fn(String) -> task.Task(Option(atproto.Agent)),
) {
  use agent <- task.then(factory(did))
  use agent <- task.then(case agent {
    None -> task.fail(error.Unauthorized("Unauthorized"))
    Some(a) -> task.ok(a)
  })
  use handle <- task.then(id_resolver.resolve_did_to_handle(ctx.resolver, did))
  use resolved <- task.then(bsky_profile.fetch(
    ctx.env.bsky_appview_url,
    did,
    Some(agent),
  ))
  let users = u.table()
  use _ <- task.then(case handle {
    "" -> task.ok(Nil)
    _ -> {
      use _ <- task.then(
        insert(users, [
          set(u.did(users), did),
          set(u.handle(users), handle),
          set(u.display_name(users), resolved.display_name),
          set(u.avatar(users), option.unwrap(resolved.avatar, "")),
        ])
        |> run(ctx.db)
        |> task.map(fn(_) { Nil })
        |> task.rescue(fn(e) {
          case
            string.contains(
              error.to_string(e),
              "invalid record: column [did]: is not unique",
            )
          {
            False -> {
              log.error(error.describe(e))
              task.ok(Nil)
            }
            True ->
              update(
                users,
                list.flatten([
                  [set(u.handle(users), handle)],
                  case resolved.display_name {
                    None -> []
                    Some(v) -> [set(u.display_name(users), Some(v))]
                  },
                  case resolved.avatar {
                    None -> []
                    Some(v) -> [set(u.avatar(users), v)]
                  },
                ]),
                eq(u.did(users), did),
              )
              |> run(ctx.db)
              |> task.map(fn(_) { Nil })
          }
        }),
      )
      use rows <- task.map(task.all2(
        from(users) |> where(eq(u.did(users), did)) |> limit(1) |> all(ctx.db),
        from(users) |> order_by([desc(u.created_at(users))]) |> one(ctx.db),
      ))
      nats.publish(
        ctx.nc,
        "rocksky.user",
        json.array(rows.0, user_rows.to_json)
          |> helpers.deep_snake_case_keys
          |> json.to_string,
      )
      case rows.1 {
        Some(user) -> kv.memory_set(ctx.kv, "lastUser", user.id)
        None -> Nil
      }
    }
  })
  let spotify = sa.table()
  let tokens = st.table()
  use accounts <- task.map(task.all2(
    from(spotify)
      |> where(
        and([eq(sa.user_id(spotify), did), eq(sa.is_beta_user(spotify), True)]),
      )
      |> one(ctx.db),
    from(tokens) |> where(eq(st.user_id(tokens), did)) |> one(ctx.db),
  ))
  json.object(
    list.flatten([
      [
        #("handle", json.string(handle)),
        #("did", json.string(did)),
        #("spotifyConnected", json.bool(option.is_some(accounts.1))),
      ],
      optional("displayName", resolved.display_name, json.string),
      optional("avatar", resolved.avatar, json.string),
      optional("spotifyUser", accounts.0, fn(a) {
        spotify_accounts.to_json(a) |> helpers.deep_snake_case_keys
      }),
    ]),
  )
}

pub fn app(ctx: Context) {
  hono.new()
  |> hono.get("/login", fn(c) {
    metrics.count_request(ctx.metrics, "GET", "/login")
    let handle = option.unwrap(hono.query(c, "handle"), "")
    let prompt = helpers.non_empty(hono.query(c, "prompt"))
    case !identity.is_valid_handle(handle) && option.is_none(prompt) {
      True -> promise.resolve(hono.text(c, "Invalid handle", 400))
      False ->
        respond.with(
          c,
          authorize(
            ctx,
            handle,
            prompt,
            option.is_some(helpers.non_empty(hono.query(c, "cli"))),
          ),
          hono.redirect(c, _),
        )
    }
  })
  |> hono.post("/login", fn(c) {
    metrics.count_request(ctx.metrics, "POST", "/login")
    let work = {
      use raw <- task.then(hono.json_body(c) |> task.attempt_result)
      let handle =
        decode.run(js.get(raw, "handle"), decode.string) |> result.unwrap("")
      let password =
        decode.run(js.get(raw, "password"), decode.string)
        |> option.from_result
        |> helpers.non_empty
      let cli =
        decode.run(js.get(raw, "cli"), decode.bool) |> result.unwrap(False)
      case identity.is_valid_handle(handle), password {
        False, _ -> task.fail(error.InvalidRequest("Invalid handle"))
        True, Some(password) -> password_login(ctx, handle, password)
        True, None -> authorize(ctx, handle, None, cli)
      }
    }
    respond.with(c, work, hono.text(c, _, 200))
  })
  |> hono.get("/oauth/callback", fn(c) {
    metrics.count_request(ctx.metrics, "GET", "/oauth/callback")
    callback(ctx, c)
  })
  |> hono.get("/profile", fn(c) {
    metrics.count_request(ctx.metrics, "GET", "/profile")
    respond.json(c, {
      use did <- task.then(auth.did(ctx, c))
      profile(ctx, did, agent.create(ctx, _))
    })
  })
  |> hono.get("/client-metadata.json", fn(c) {
    metrics.count_request(ctx.metrics, "GET", "/client-metadata.json")
    promise.resolve(hono.json(
      c,
      row.dynamic_to_json(oauth.client_metadata(ctx.oauth_client)),
      200,
    ))
  })
  |> hono.get("/oauth-client-metadata.json", fn(c) {
    promise.resolve(hono.json(
      c,
      row.dynamic_to_json(oauth.client_metadata(ctx.oauth_client)),
      200,
    ))
  })
  |> hono.get("/token", fn(c) {
    metrics.count_request(ctx.metrics, "GET", "/token")
    let token =
      option.then(hono.header(c, "session-did"), fn(did) {
        case did {
          "" | "null" -> None
          _ -> {
            let token = kv.memory_get(ctx.kv, did)
            kv.memory_delete(ctx.kv, did)
            token
          }
        }
      })
    promise.resolve(case token {
      None -> hono.text(c, "Unauthorized", 401)
      Some(token) ->
        hono.json(c, json.object([#("token", json.string(token))]), 200)
    })
  })
  |> hono.get("/jwks.json", fn(c) { promise.resolve(hono.json(c, jwks(), 200)) })
}

pub fn jwks() {
  json.object([
    #(
      "keys",
      json.array(
        [
          json.object([
            #("kty", json.string("EC")),
            #("use", json.string("sig")),
            #("alg", json.string("ES256")),
            #("kid", json.string("2dfa3fd9-57b3-4738-ac27-9e6dadec13b7")),
            #("crv", json.string("P-256")),
            #("x", json.string("V_00KDnoEPsNqbt0y2Ke8v27Mv9WP70JylDUD5rvIek")),
            #("y", json.string("HAyjaQeA2DU6wjZO0ggTadUS6ij1rmiYTxzmWeBKfRc")),
          ]),
          json.object([
            #("kty", json.string("EC")),
            #("use", json.string("sig")),
            #("alg", json.string("ES256")),
            #("kid", json.string("5e816ff2-6bff-4177-b1c0-67ad3cd3e7cd")),
            #("crv", json.string("P-256")),
            #("x", json.string("YwEY5NsoYQVB_G7xPYMl9sUtxRbcPFNffnZcTS5nbPQ")),
            #("y", json.string("5n5mybPvISyYAnRv1Ii1geqKfXv2GA8p9Xemwx2a8CM")),
          ]),
          json.object([
            #("kty", json.string("EC")),
            #("use", json.string("sig")),
            #("kid", json.string("a1067a48-a54a-43a0-9758-4d55b51fdd8b")),
            #("crv", json.string("P-256")),
            #("x", json.string("yq17Nd2DGcjP1i9I0NN3RBmgSbLQUZOtG6ec5GaqzmU")),
            #("y", json.string("ieIU9mcfaZwAW5b3WgJkIRgddymG_ckcZ0n1XjbEIvc")),
          ]),
        ],
        fn(x) { x },
      ),
    ),
  ])
}
