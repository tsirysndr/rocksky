import gleam/int
import gleam/json
import gleam/list
import gleam/option.{None, Some}
import rocksky_api/context.{type Context}
import rocksky_api/drizzle/orm.{and, eq, from, one, where}
import rocksky_api/drizzle/schema/user_uploads as up
import rocksky_api/drizzle/schema/users as us
import rocksky_api/error
import rocksky_api/lib/auth
import rocksky_api/lib/respond
import rocksky_api/node/crypto
import rocksky_api/node/hono
import rocksky_api/node/redis
import rocksky_api/node/s3
import rocksky_api/task

pub fn managed_client(ctx: Context) {
  s3.client(
    ctx.env.s3_region,
    ctx.env.s3_endpoint,
    ctx.env.s3_access_key_id,
    ctx.env.s3_secret_access_key,
  )
}

pub fn token(ctx: Context, c: hono.Context) {
  let work = {
    use user <- task.then(auth.user(ctx, c))
    let token = crypto.random_bytes_hex(20)
    let ttl = case hono.query(c, "purpose") {
      Some("cast") -> 86_400
      _ -> 3600
    }
    use _ <- task.map(
      redis.set_ex(ctx.redis, "stream:" <> token, ttl, user.id)
      |> task.attempt_result,
    )
    json.object([#("token", json.string(token)), #("expiresIn", json.int(ttl))])
  }
  respond.json(c, work)
}

pub fn options(c: hono.Context) {
  [
    #("Access-Control-Allow-Origin", "*"),
    #("Access-Control-Allow-Methods", "GET, OPTIONS"),
    #("Access-Control-Allow-Headers", "Range, Authorization"),
    #(
      "Access-Control-Expose-Headers",
      "Content-Range, Content-Length, Accept-Ranges",
    ),
    #("Access-Control-Max-Age", "86400"),
  ]
  |> list.each(fn(header) { hono.set_header(c, header.0, header.1) })
  hono.empty(c, 204) |> hono.respond
}

fn user(ctx: Context, c: hono.Context) {
  case hono.query(c, "token") {
    None | Some("") -> auth.user(ctx, c)
    Some(token) -> {
      use id <- task.then(
        redis.get(ctx.redis, "stream:" <> token) |> task.attempt_result,
      )
      case id {
        None -> task.fail(error.Unauthorized("Unauthorized"))
        Some(id) -> {
          let users = us.table()
          use user <- task.then(
            from(users) |> where(eq(us.id(users), id)) |> one(ctx.db),
          )
          case user {
            Some(user) -> task.ok(user)
            None -> task.fail(error.Unauthorized("Unauthorized"))
          }
        }
      }
    }
  }
}

pub fn stream(ctx: Context, c: hono.Context) {
  let work = {
    use user <- task.then(user(ctx, c))
    let uploads = up.table()
    use upload <- task.then(
      from(uploads)
      |> where(
        and([
          eq(up.id(uploads), hono.param(c, "id")),
          eq(up.user_id(uploads), user.id),
        ]),
      )
      |> one(ctx.db)
      |> task.require_task("Upload not found"),
    )
    let range = hono.header(c, "range")
    use object <- task.then(
      s3.get_stream(
        managed_client(ctx),
        ctx.env.s3_bucket_name,
        upload.r2_key,
        range,
      )
      |> task.attempt_result,
    )
    case object.body {
      None -> task.fail(error.Message("Stream unavailable"))
      Some(body) -> {
        let mime = case upload.mime_type {
          "" -> option.unwrap(object.content_type, "audio/mpeg")
          _ -> upload.mime_type
        }
        let headers = [
          #("Content-Type", mime),
          #("Accept-Ranges", "bytes"),
          #("Cache-Control", "private, max-age=3600"),
          #("Access-Control-Allow-Origin", "*"),
          #("Access-Control-Allow-Headers", "Range, Authorization"),
          #(
            "Access-Control-Expose-Headers",
            "Content-Range, Content-Length, Accept-Ranges",
          ),
          ..case object.content_length {
            Some(n) -> [#("Content-Length", int.to_string(n))]
            None -> []
          }
        ]
        let headers = case range, object.content_range {
          Some(_), Some(r) -> [#("Content-Range", r), ..headers]
          _, _ -> headers
        }
        task.ok(
          hono.body_response(body, headers, case range {
            Some("") | None -> 200
            _ -> 206
          }),
        )
      }
    }
  }
  respond.with(c, work, fn(r) { r })
}
