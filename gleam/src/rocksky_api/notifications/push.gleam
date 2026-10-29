import gleam/dynamic/decode
import gleam/javascript/promise.{type Promise}
import gleam/string
import rocksky_api/context.{type Context}
import rocksky_api/db/db.{type Db}
import rocksky_api/error
import rocksky_api/lib/auth
import rocksky_api/lib/respond
import rocksky_api/node/hono
import rocksky_api/node/js.{type Exception}
import rocksky_api/task

@external(javascript, "./push_ffi.mjs", "saveDevice")
fn save_device(
  db: Db,
  user: String,
  token: String,
  remove: Bool,
) -> Promise(Result(Nil, Exception))

@external(javascript, "./push_ffi.mjs", "publish")
pub fn publish(db: Db, user: String, payload: String) -> Nil

fn device(ctx: Context, c: hono.Context, remove: Bool) {
  let work = {
    use user <- task.then(auth.user(ctx, c))
    use body <- task.then(hono.json_body(c) |> task.attempt_result)
    use token <- task.then(
      decode.run(body, {
        use token <- decode.field("token", decode.string)
        decode.success(token)
      })
      |> error.decode("Device token", _)
      |> task.from_result,
    )
    use _ <- task.then(
      case string.length(token) > 0 && string.length(token) <= 4096 {
        True -> task.ok(Nil)
        False -> task.fail(error.InvalidRequest("Invalid device token"))
      },
    )
    save_device(ctx.db, user.id, token, remove) |> task.attempt_result
  }
  respond.status_ok(c, work)
}

pub fn app(ctx: Context) {
  hono.new()
  |> hono.post("/devices", fn(c) { device(ctx, c, False) })
  |> hono.post("/devices/remove", fn(c) { device(ctx, c, True) })
}
