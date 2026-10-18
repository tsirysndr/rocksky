import gleam/dynamic/decode
import gleam/float
import gleam/int
import gleam/javascript/promise
import gleam/json
import gleam/list
import gleam/option.{None, Some}
import gleam/string
import rocksky_api/cloud/common
import rocksky_api/context.{type Context}
import rocksky_api/drizzle/orm.{
  all, all_columns, and, count_column, eq, eq_columns, field, from, group_by,
  having, insert, left_join, lt, nested, nullable, one, optional_selection, pair,
  reference, run, select, set, update, where,
}
import rocksky_api/drizzle/schema/spotify_accounts as sa
import rocksky_api/drizzle/schema/spotify_apps as ap
import rocksky_api/drizzle/schema/spotify_tokens as st
import rocksky_api/error
import rocksky_api/kv
import rocksky_api/lib/auth
import rocksky_api/lib/respond
import rocksky_api/log
import rocksky_api/node/crypto
import rocksky_api/node/fetch
import rocksky_api/node/hono
import rocksky_api/node/http_fetch
import rocksky_api/node/js
import rocksky_api/node/nats
import rocksky_api/rest/ratelimiter
import rocksky_api/spotify/playback
import rocksky_api/task
import rocksky_api/xrpc/app/rocksky/spotify/get_currently_playing as current

fn beta_account(ctx: Context, user_id: String) {
  let accounts = sa.table()
  let apps = ap.table()
  select(
    accounts,
    pair(
      nested("account", all_columns(accounts)),
      nested("app", all_columns(apps) |> optional_selection),
    ),
  )
  |> left_join(
    apps,
    eq_columns(sa.spotify_app_id(accounts), nullable(ap.spotify_app_id(apps))),
  )
  |> where(
    and([eq(sa.user_id(accounts), user_id), eq(sa.is_beta_user(accounts), True)]),
  )
  |> one(ctx.db)
}

fn decrypt(ctx: Context, text: String) {
  crypto.aes_ctr_decrypt(
    text,
    ctx.env.spotify_encryption_key,
    ctx.env.spotify_encryption_iv,
  )
  |> error.map_js
  |> task.from_result
}

fn encrypt(ctx: Context, text: String) {
  crypto.aes_ctr_encrypt(
    text,
    ctx.env.spotify_encryption_key,
    ctx.env.spotify_encryption_iv,
  )
  |> error.map_js
  |> task.from_result
}

pub fn app(ctx: Context) {
  hono.new()
  |> hono.use_(
    "/currently-playing",
    ratelimiter.named_middleware(ctx, 10, 15, "spotify-ratelimit"),
  )
  |> hono.get("/login", fn(c) {
    let work = {
      use user <- task.then(auth.user(ctx, c))
      use account <- task.map(beta_account(ctx, user.id))
      let client =
        option.then(account, fn(a) { a.1 })
        |> option.map(fn(a) { a.spotify_app_id })
        |> option.unwrap("undefined")
      let state = crypto.random_bytes_hex(16)
      kv.memory_set(ctx.kv, state, user.did)
      hono.set_header(
        c,
        "Set-Cookie",
        "session-id=" <> state <> "; Path=/; HttpOnly; SameSite=Strict; Secure",
      )
      let scopes =
        "user-read-private%20user-read-email%20user-read-playback-state%20user-read-currently-playing%20user-modify-playback-state%20playlist-modify-public%20playlist-modify-private%20playlist-read-private%20playlist-read-collaborative"
      json.object([
        #(
          "redirectUrl",
          json.string(
            "https://accounts.spotify.com/en/authorize?client_id="
            <> client
            <> "&response_type=code&redirect_uri="
            <> ctx.env.spotify_redirect_uri
            <> "&scope="
            <> scopes
            <> "&state="
            <> state,
          ),
        ),
      ])
    }
    respond.json(c, work)
  })
  |> hono.get("/callback", fn(c) {
    respond.with(c, callback(ctx, c), fn(_) {
      hono.redirect(c, ctx.env.frontend_url)
    })
  })
  |> hono.post("/join", fn(c) {
    let work = {
      use user <- task.then(auth.user(ctx, c))
      use email <- task.then(common.email(c))
      let apps = ap.table()
      let accounts = sa.table()
      use available <- task.then(
        select(apps, field("client", ap.spotify_app_id(apps)))
        |> left_join(
          accounts,
          eq_columns(
            nullable(ap.spotify_app_id(apps)),
            sa.spotify_app_id(accounts),
          ),
        )
        |> group_by([reference(ap.id(apps)), reference(ap.spotify_app_id(apps))])
        |> having(lt(count_column(sa.id(accounts)), 25))
        |> all(ctx.db),
      )
      let client = list.first(available) |> option.from_result
      use _ <- task.then(
        insert(accounts, [
          set(sa.user_id(accounts), user.id),
          set(sa.email(accounts), email),
          set(sa.is_beta_user(accounts), False),
          set(sa.spotify_app_id(accounts), client),
        ])
        |> run(ctx.db)
        |> task.rescue(fn(e) {
          case
            string.contains(
              error.to_string(e),
              "duplicate key value violates unique constraint",
            )
          {
            True -> task.fail(e)
            False -> {
              log.error(error.describe(e))
              task.ok(0)
            }
          }
        }),
      )
      common.join_beta(ctx, email)
    }
    respond.json(c, work)
  })
  |> hono.get("/currently-playing", fn(c) {
    let work = {
      use did <- task.then(auth.optional_did(ctx, c))
      let actor = case hono.query(c, "did") {
        None | Some("") -> did
        value -> value
      }
      case actor {
        None -> task.fail(error.Unauthorized("Unauthorized"))
        Some(actor) ->
          current.retrieve(ctx, actor, True)
          |> task.map_error(fn(e) {
            case e {
              error.NotFound(_) -> error.Unauthorized("Unauthorized")
              _ -> e
            }
          })
      }
    }
    respond.json(c, work)
  })
  |> hono.put("/pause", command(ctx, _, "pause", "PUT"))
  |> hono.put("/play", command(ctx, _, "play", "PUT"))
  |> hono.post("/next", command(ctx, _, "next", "POST"))
  |> hono.post("/previous", command(ctx, _, "previous", "POST"))
  |> hono.put("/seek", fn(c) {
    command(
      ctx,
      c,
      "seek?position_ms="
        <> option.unwrap(hono.query(c, "position_ms"), "undefined"),
      "PUT",
    )
  })
  |> hono.get("/volume", volume(ctx, _))
  |> hono.put("/volume", volume(ctx, _))
}

fn callback(ctx: Context, c: hono.Context) {
  let state = hono.query(c, "state")
  case option.then(state, kv.memory_get(ctx.kv, _)) {
    None -> task.ok(Nil)
    Some(did) -> {
      kv.memory_delete(ctx.kv, option.unwrap(state, ""))
      use user <- task.then(auth.user_by_did(ctx, did))
      case user {
        None -> task.ok(Nil)
        Some(user) -> {
          use account <- task.then(
            beta_account(ctx, user.id)
            |> task.require_task("Spotify beta account missing"),
          )
          let client =
            option.unwrap(account.0.spotify_app_id, ctx.env.spotify_client_id)
          let secret =
            option.map(account.1, fn(a) { a.spotify_secret })
            |> option.unwrap(ctx.env.spotify_client_secret)
          use secret <- task.then(decrypt(ctx, secret))
          let body =
            json.object([
              #("grant_type", json.string("authorization_code")),
              #(
                "code",
                json.string(option.unwrap(hono.query(c, "code"), "undefined")),
              ),
              #("redirect_uri", json.string(ctx.env.spotify_redirect_uri)),
              #("client_id", json.string(client)),
              #("client_secret", json.string(secret)),
            ])
            |> fetch.query
          use response <- task.then(
            fetch.request(
              "https://accounts.spotify.com/api/token",
              "POST",
              [#("Content-Type", "application/x-www-form-urlencoded")],
              Some(body),
            )
            |> task.attempt_result,
          )
          let decoder = {
            use access <- decode.field("access_token", decode.string)
            use refresh <- decode.field("refresh_token", decode.string)
            decode.success(#(access, refresh))
          }
          use tokens <- task.then(
            decode.run(response.data, decoder)
            |> error.decode("Spotify token", _)
            |> task.from_result,
          )
          use tokens <- task.then(task.all2(
            encrypt(ctx, tokens.0),
            encrypt(ctx, tokens.1),
          ))
          let table = st.table()
          use existing <- task.then(
            from(table) |> where(eq(st.user_id(table), user.id)) |> one(ctx.db),
          )
          let values = [
            set(st.access_token(table), tokens.0),
            set(st.refresh_token(table), tokens.1),
          ]
          use _ <- task.map(
            case existing {
              Some(t) -> update(table, values, eq(st.id(table), t.id))
              None ->
                insert(table, [
                  set(st.user_id(table), user.id),
                  set(st.spotify_app_id(table), client),
                  ..values
                ])
            }
            |> run(ctx.db),
          )
          nats.publish(ctx.nc, "rocksky.spotify.user", account.0.email)
        }
      }
    }
  }
}

fn access(ctx: Context, c: hono.Context) {
  use user <- task.then(auth.user(ctx, c))
  playback.token(ctx, user.did)
  |> task.map_error(fn(e) {
    case e {
      error.NotFound(_) -> error.Unauthorized("Unauthorized")
      _ -> e
    }
  })
}

fn command(ctx: Context, c: hono.Context, path: String, method: String) {
  let work = {
    use token <- task.then(access(ctx, c))
    use response <- task.then(
      http_fetch.request(
        ctx.env.spotify_api_url <> "/me/player/" <> path,
        method,
        [#("Authorization", "Bearer " <> token)],
        None,
      )
      |> task.attempt_result,
    )
    case http_fetch.status(response) {
      403 ->
        http_fetch.text(response)
        |> task.attempt_result
        |> task.map(hono.text(c, _, 403))
      204 -> task.ok(hono.empty(c, 204))
      _ ->
        http_fetch.json(response)
        |> task.attempt_result
        |> task.map(hono.json_dynamic(c, _, 200))
    }
  }
  respond.with(c, work, fn(r) { r })
}

fn volume(ctx: Context, c: hono.Context) {
  let raw = hono.query(c, "volume_percent")
  let value =
    option.then(raw, fn(s) {
      option.then(js.number_from_string(s), fn(n) {
        let i = float.truncate(n)
        case int.to_float(i) == n {
          True -> Some(i)
          False -> None
        }
      })
    })
  let valid = case value {
    Some(n) if n >= 0 && n <= 100 -> True
    _ -> False
  }
  case hono.method(c) == "PUT" && !valid {
    True ->
      hono.json(
        c,
        json.object([
          #("error", json.string("Volume must be an integer from 0 to 100")),
        ]),
        400,
      )
      |> hono.respond
    False -> {
      let work = {
        use user <- task.then(auth.user(ctx, c))
        use token <- task.then(
          playback.verified_token(ctx, user.did)
          |> task.map_error(fn(e) {
            case e {
              error.NotFound(_) -> error.Unauthorized("Unauthorized")
              error.Decode(_, _) ->
                error.Unauthorized("Spotify authorization failed")
              _ -> e
            }
          }),
        )
        let path = case hono.method(c) {
          "GET" -> "/me/player"
          _ ->
            "/me/player/volume?volume_percent="
            <> int.to_string(option.unwrap(value, 0))
        }
        use response <- task.then(
          http_fetch.request(
            ctx.env.spotify_api_url <> path,
            hono.method(c),
            [#("Authorization", "Bearer " <> token)],
            None,
          )
          |> task.attempt_result,
        )
        let status = http_fetch.status(response)
        case status >= 200 && status < 300 {
          False -> {
            use body <- task.map(
              http_fetch.text(response) |> task.attempt_result,
            )
            hono.set_header(
              c,
              "Content-Type",
              option.unwrap(
                http_fetch.header(response, "Content-Type"),
                "text/plain",
              ),
            )
            hono.text(c, body, status)
          }
          True ->
            case hono.method(c), status {
              "PUT", _ -> task.ok(hono.empty(c, 204))
              _, 204 ->
                task.ok(hono.json(
                  c,
                  json.object([
                    #("volume", json.null()),
                    #("supported", json.bool(False)),
                  ]),
                  200,
                ))
              _, _ -> {
                use data <- task.then(
                  http_fetch.json(response) |> task.attempt_result,
                )
                let decoder =
                  decode.optional_field(
                    "device",
                    #(None, False),
                    {
                      use volume <- decode.optional_field(
                        "volume_percent",
                        None,
                        decode.optional(decode.float),
                      )
                      use supports <- decode.optional_field(
                        "supports_volume",
                        False,
                        decode.bool,
                      )
                      use restricted <- decode.optional_field(
                        "is_restricted",
                        False,
                        decode.bool,
                      )
                      decode.success(#(volume, supports && !restricted))
                    }
                      |> decode.optional
                      |> decode.map(option.unwrap(_, #(None, False))),
                    decode.success,
                  )
                use data <- task.map(
                  decode.run(data, decoder)
                  |> error.decode("Spotify device", _)
                  |> task.from_result,
                )
                hono.json(
                  c,
                  json.object([
                    #("volume", json.nullable(data.0, json.float)),
                    #("supported", json.bool(data.1)),
                  ]),
                  200,
                )
              }
            }
        }
      }
      use outcome <- promise.map(work)
      case outcome {
        Error(error.Unauthorized("Spotify authorization failed")) ->
          hono.json(
            c,
            json.object([
              #("error", json.string("Spotify authorization failed")),
            ]),
            401,
          )
        Error(e) -> respond.error(c, e)
        Ok(r) -> r
      }
    }
  }
}
