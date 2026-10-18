import gleam/json
import gleam/option.{None, Some}
import gleam/string
import rocksky_api/cloud/common
import rocksky_api/context.{type Context}
import rocksky_api/db/row
import rocksky_api/drizzle/orm.{
  conflict_target, eq, from, insert, on_conflict_update, one, returning_one, run,
  set, where,
}
import rocksky_api/drizzle/schema/dropbox as d
import rocksky_api/drizzle/schema/dropbox_accounts as a
import rocksky_api/drizzle/schema/dropbox_tokens as t
import rocksky_api/error
import rocksky_api/lib/auth
import rocksky_api/lib/helpers
import rocksky_api/lib/respond
import rocksky_api/log
import rocksky_api/node/hono
import rocksky_api/task
import rocksky_api/telemetry/metrics

pub fn callback(ctx: Context, code: String, state: String) {
  use encrypted <- task.then(
    common.exchange(ctx, "https://api.dropboxapi.com/oauth2/token", [
      #("code", json.string(code)),
      #("grant_type", json.string("authorization_code")),
      #("client_id", json.string(ctx.env.dropbox_client_id)),
      #("client_secret", json.string(ctx.env.dropbox_client_secret)),
      #("redirect_uri", json.string(ctx.env.dropbox_redirect_uri)),
    ]),
  )
  let dropbox = d.table()
  let tokens = t.table()
  use existing <- task.then(
    from(dropbox) |> where(eq(d.user_id(dropbox), state)) |> one(ctx.db),
  )
  use old_token <- task.then(case existing {
    None -> task.ok(None)
    Some(d) ->
      from(tokens) |> where(eq(t.id(tokens), d.dropbox_token_id)) |> one(ctx.db)
  })
  let value = set(t.refresh_token(tokens), encrypted)
  let values = [
    value,
    ..case old_token {
      None -> []
      Some(old) -> [set(t.id(tokens), old.id)]
    }
  ]
  use token <- task.then(
    insert(tokens, values)
    |> on_conflict_update([conflict_target(t.id(tokens))], [value])
    |> returning_one(ctx.db, "Dropbox token insert failed"),
  )
  let values = [
    set(d.dropbox_token_id(dropbox), token.id),
    set(d.user_id(dropbox), state),
  ]
  insert(dropbox, case existing {
    None -> values
    Some(old) -> [set(d.id(dropbox), old.id), ..values]
  })
  |> on_conflict_update([conflict_target(d.id(dropbox))], values)
  |> run(ctx.db)
}

pub fn files(ctx: Context, did: String, path: option.Option(String)) {
  let fields = [#("did", json.string(did))]
  case helpers.non_empty(path) {
    Some(path) ->
      common.post_json(ctx.dropbox, "dropbox.getFilesAt", [
        #("path", json.string(path)),
        ..fields
      ])
    None ->
      common.post_json(ctx.dropbox, "dropbox.getFiles", fields)
      |> task.rescue(fn(_) {
        use _ <- task.then(common.post(
          ctx.dropbox,
          "dropbox.createMusicFolder",
          fields,
        ))
        common.post_json(ctx.dropbox, "dropbox.getFiles", fields)
      })
  }
}

pub fn app(ctx: Context) {
  hono.new()
  |> hono.get("/login", fn(c) {
    metrics.count_request(ctx.metrics, "GET", "/dropbox/login")
    respond.json(c, {
      use user <- task.map(auth.user(ctx, c))
      json.object([
        #(
          "redirectUri",
          json.string(
            "https://www.dropbox.com/oauth2/authorize?client_id="
            <> ctx.env.dropbox_client_id
            <> "&redirect_uri="
            <> ctx.env.dropbox_redirect_uri
            <> "&response_type=code&token_access_type=offline&state="
            <> user.id,
          ),
        ),
      ])
    })
  })
  |> hono.get("/oauth/callback", fn(c) {
    metrics.count_request(ctx.metrics, "GET", "/dropbox/oauth/callback")
    respond.with(
      c,
      callback(
        ctx,
        option.unwrap(hono.query(c, "code"), ""),
        option.unwrap(hono.query(c, "state"), ""),
      ),
      fn(_) { hono.redirect(c, ctx.env.frontend_url <> "/dropbox") },
    )
  })
  |> hono.post("/join", fn(c) {
    metrics.count_request(ctx.metrics, "POST", "/dropbox/join")
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
              "invalid record: column [user_id]: is not unique",
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
    metrics.count_request(ctx.metrics, "GET", "/dropbox/files")
    respond.json(c, {
      use user <- task.then(auth.user(ctx, c))
      files(ctx, user.did, hono.query(c, "path"))
    })
  })
  |> hono.get("/temporary-link", fn(c) {
    request(ctx, c, "dropbox.getTemporaryLink", "/temporary-link", False, False)
  })
  |> hono.get("/files/:id", fn(c) {
    request(ctx, c, "dropbox.getMetadata", "/files/:id", True, False)
  })
  |> hono.get("/file", fn(c) {
    request(ctx, c, "dropbox.getMetadata", "/file", False, False)
  })
  |> hono.get("/download", fn(c) {
    request(ctx, c, "dropbox.downloadFile", "/download", False, True)
  })
}

fn request(
  ctx: Context,
  c: hono.Context,
  method: String,
  route: String,
  parameter: Bool,
  download: Bool,
) {
  metrics.count_request(ctx.metrics, "GET", "/dropbox" <> route)
  let work = {
    use user <- task.then(auth.user(ctx, c))
    use path <- task.then(
      case
        helpers.non_empty(case parameter {
          True -> Some(hono.param(c, "id"))
          False -> hono.query(c, "path")
        })
      {
        None -> task.fail(error.InvalidRequest("Bad Request, path is required"))
        Some(p) -> task.ok(p)
      },
    )
    common.post(ctx.dropbox, method, [
      #("did", json.string(user.did)),
      #("path", json.string(path)),
    ])
  }
  respond.with(c, work, fn(response) {
    case download {
      True -> common.download(response)
      False -> hono.json(c, row_json(response.data), 200)
    }
  })
}

fn row_json(raw) {
  row.dynamic_to_json(raw)
}
