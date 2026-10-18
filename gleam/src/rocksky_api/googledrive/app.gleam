import gleam/dynamic/decode
import gleam/json
import gleam/list
import gleam/option.{None, Some}
import gleam/result
import gleam/string
import rocksky_api/cloud/common
import rocksky_api/context.{type Context}
import rocksky_api/db/row
import rocksky_api/drizzle/orm.{
  eq, from, insert, one, returning_one, run, set, update, where,
}
import rocksky_api/drizzle/schema/google_drive_accounts as a
import rocksky_api/drizzle/schema/google_drive_tokens as t
import rocksky_api/drizzle/schema/googledrive as g
import rocksky_api/error
import rocksky_api/lib/auth
import rocksky_api/lib/helpers
import rocksky_api/lib/respond
import rocksky_api/log
import rocksky_api/node/axios
import rocksky_api/node/google_oauth
import rocksky_api/node/hono
import rocksky_api/node/js
import rocksky_api/task
import rocksky_api/telemetry/metrics
import simplifile

pub type Credentials {
  Credentials(client_id: String, client_secret: String)
}

pub fn credentials() {
  let loaded = {
    use raw <- result.try(
      simplifile.read("credentials.json")
      |> result.map_error(fn(e) { error.Message(simplifile.describe_error(e)) }),
    )
    use raw <- result.try(js.parse_json(raw) |> result.map_error(error.Js))
    let config = case js.is_nullish(js.get(raw, "installed")) {
      True -> js.get(raw, "web")
      False -> js.get(raw, "installed")
    }
    decode.run(config, {
      use id <- decode.field("client_id", decode.string)
      use secret <- decode.field("client_secret", decode.string)
      decode.success(Credentials(id, secret))
    })
    |> result.map_error(error.Decode("Google credentials", _))
  }
  task.from_result(loaded)
}

pub fn authorization_url(
  ctx: Context,
  user_id: String,
  credentials: Credentials,
) {
  google_oauth.authorize_url(
    credentials.client_id,
    credentials.client_secret,
    ctx.env.google_redirect_uri,
    user_id,
  )
}

pub fn callback(
  ctx: Context,
  code: String,
  state: String,
  credentials: Credentials,
) {
  use encrypted <- task.then(
    common.exchange(ctx, "https://oauth2.googleapis.com/token", [
      #("code", json.string(code)),
      #("client_id", json.string(credentials.client_id)),
      #("client_secret", json.string(credentials.client_secret)),
      #("redirect_uri", json.string(ctx.env.google_redirect_uri)),
      #("grant_type", json.string("authorization_code")),
    ]),
  )
  let drive = g.table()
  let tokens = t.table()
  use existing <- task.then(
    from(drive) |> where(eq(g.user_id(drive), state)) |> one(ctx.db),
  )
  use old_token <- task.then(case existing {
    None -> task.ok(None)
    Some(d) ->
      from(tokens)
      |> where(eq(t.id(tokens), d.google_drive_token_id))
      |> one(ctx.db)
  })
  let values = [set(t.refresh_token(tokens), encrypted)]
  let mutation = case old_token {
    None -> insert(tokens, values)
    Some(old) -> update(tokens, values, eq(t.id(tokens), old.id))
  }
  use token <- task.then(
    mutation |> returning_one(ctx.db, "Google token write failed"),
  )
  let values = [
    set(g.google_drive_token_id(drive), token.id),
    set(g.user_id(drive), state),
  ]
  let mutation = case existing {
    None -> insert(drive, values)
    Some(old) -> update(drive, values, eq(g.id(drive), old.id))
  }
  mutation |> run(ctx.db)
}

fn music_directory(ctx: Context, fields) {
  use response <- task.then(common.post(
    ctx.googledrive,
    "googledrive.getMusicDirectory",
    fields,
  ))
  decode.run(
    response.data,
    decode.at(
      ["files"],
      decode.list(decode.field("id", decode.string, decode.success)),
    ),
  )
  |> result.map_error(error.Decode("Google music directory", _))
  |> task.from_result
}

pub fn files(ctx: Context, did: String, parent: option.Option(String)) {
  let fields = [#("did", json.string(did))]
  use parent <- task.then(case helpers.non_empty(parent) {
    Some(parent) -> task.ok(parent)
    None -> {
      use files <- task.then(music_directory(ctx, fields))
      use files <- task.then(case files {
        [] -> {
          use _ <- task.then(common.post(
            ctx.googledrive,
            "googledrive.createMusicDirectory",
            fields,
          ))
          music_directory(ctx, fields)
        }
        _ -> task.ok(files)
      })
      list.first(files)
      |> result.map_error(fn(_) { error.Message("Music directory not found") })
      |> task.from_result
    }
  })
  common.post_json(ctx.googledrive, "googledrive.getFilesInParents", [
    #("parent_id", json.string(parent)),
    ..fields
  ])
}

pub fn app(ctx: Context) {
  app_with_credentials(ctx, credentials)
}

pub fn app_with_credentials(
  ctx: Context,
  load: fn() -> task.Task(Credentials),
) {
  hono.new()
  |> hono.get("/login", fn(c) {
    metrics.count_request(ctx.metrics, "GET", "/googledrive/login")
    respond.json(c, {
      use user <- task.then(auth.user(ctx, c))
      use credentials <- task.map(load())
      json.object([
        #("authUrl", json.string(authorization_url(ctx, user.id, credentials))),
      ])
    })
  })
  |> hono.get("/oauth/callback", fn(c) {
    metrics.count_request(ctx.metrics, "GET", "/googledrive/oauth/callback")
    let work = {
      use credentials <- task.then(load())
      callback(
        ctx,
        option.unwrap(hono.query(c, "code"), ""),
        option.unwrap(hono.query(c, "state"), ""),
        credentials,
      )
    }
    respond.with(c, work, fn(_) {
      hono.redirect(c, ctx.env.frontend_url <> "/googledrive")
    })
  })
  |> hono.post("/join", fn(c) {
    metrics.count_request(ctx.metrics, "POST", "/googledrive/join")
    respond.json(c, {
      use user <- task.then(auth.user(ctx, c))
      use email <- task.then(common.email(c))
      let table = a.table()
      use _ <- task.then(
        insert(table, [
          set(a.user_id(table), user.id),
          set(a.email(table), email),
          set(a.is_beta_user(table), False),
        ])
        |> run(ctx.db)
        |> task.map(fn(_) { Nil })
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
              task.ok(Nil)
            }
          }
        }),
      )
      common.join_beta(ctx, email)
    })
  })
  |> hono.get("/files", fn(c) {
    metrics.count_request(ctx.metrics, "GET", "/googledrive/files")
    respond.json(c, {
      use user <- task.then(auth.user(ctx, c))
      files(ctx, user.did, hono.query(c, "parent_id"))
      |> task.rescue(fn(e) {
        case e {
          error.Js(raw) ->
            case axios.is_axios_error(raw) {
              True -> {
                use credentials <- task.map(load())
                json.object([
                  #("error", json.string("Failed to fetch files")),
                  #(
                    "authUrl",
                    json.string(authorization_url(ctx, user.id, credentials)),
                  ),
                ])
              }
              False -> task.fail(e)
            }
          _ -> task.fail(e)
        }
      })
    })
  })
  |> hono.get("/files/:id", fn(c) { request(ctx, c, False) })
  |> hono.get("/files/:id/download", fn(c) { request(ctx, c, True) })
}

fn request(ctx: Context, c: hono.Context, download: Bool) {
  metrics.count_request(
    ctx.metrics,
    "GET",
    "/googledrive/files/:id"
      <> case download {
      True -> "/download"
      False -> ""
    },
  )
  let work = {
    use user <- task.then(auth.user(ctx, c))
    common.post(
      ctx.googledrive,
      case download {
        True -> "googledrive.downloadFile"
        False -> "googledrive.getFile"
      },
      [
        #("did", json.string(user.did)),
        #("file_id", json.string(hono.param(c, "id"))),
      ],
    )
  }
  respond.with(c, work, fn(response) {
    case download {
      True -> common.download(response)
      False -> hono.json(c, row.dynamic_to_json(response.data), 200)
    }
  })
}
