import gleam/dynamic/decode
import gleam/int
import gleam/json
import gleam/option.{type Option, None, Some}
import gleam/string
import gleam/time/timestamp.{type Timestamp}
import rocksky_api/context.{type Context}
import rocksky_api/db/row
import rocksky_api/drizzle/orm.{
  all, and, delete, desc, eq, field, insert, limit, map, offset, order_by, pair,
  returning_as, returning_one_as, select, set, where,
}
import rocksky_api/drizzle/schema/access_tokens as a
import rocksky_api/error
import rocksky_api/lib/auth
import rocksky_api/lib/respond
import rocksky_api/lib/verify_token
import rocksky_api/node/crypto
import rocksky_api/node/hono
import rocksky_api/node/js
import rocksky_api/node/jwt
import rocksky_api/task

pub type Metadata {
  Metadata(
    id: String,
    name: String,
    last_four: String,
    last_used_at: Option(Timestamp),
    created_at: Timestamp,
    updated_at: Timestamp,
  )
}

fn selection(table) {
  pair(
    pair(field("id", a.id(table)), field("name", a.name(table))),
    pair(
      pair(
        field("lastFour", a.last_four(table)),
        field("lastUsedAt", a.last_used_at(table)),
      ),
      pair(
        field("createdAt", a.created_at(table)),
        field("updatedAt", a.updated_at(table)),
      ),
    ),
  )
  |> map(fn(v) { Metadata(v.0.0, v.0.1, v.1.0.0, v.1.0.1, v.1.1.0, v.1.1.1) })
}

fn fields(value: Metadata) {
  [
    #("id", json.string(value.id)),
    #("name", json.string(value.name)),
    #("lastFour", json.string(value.last_four)),
    #(
      "lastUsedAt",
      json.nullable(value.last_used_at, fn(t) { json.string(row.iso8601(t)) }),
    ),
    #("createdAt", json.string(row.iso8601(value.created_at))),
    #("updatedAt", json.string(row.iso8601(value.updated_at))),
  ]
}

fn number(c: hono.Context, key: String, default: Int) {
  hono.query(c, key)
  |> option.then(fn(s) { int.parse(s) |> option.from_result })
  |> option.then(fn(n) {
    case n == 0 {
      True -> None
      False -> Some(n)
    }
  })
  |> option.unwrap(default)
}

fn authenticate(ctx: Context, c: hono.Context) {
  auth.user(ctx, c)
  |> task.map_error(fn(_) { error.Unauthorized("Unauthorized") })
}

pub fn app(ctx: Context) {
  hono.new()
  |> hono.get("/", fn(c) {
    let work = {
      use user <- task.then(authenticate(ctx, c))
      let table = a.table()
      use rows <- task.map(
        select(table, selection(table))
        |> where(eq(a.user_id(table), user.id))
        |> order_by([desc(a.created_at(table))])
        |> limit(int.min(number(c, "size", 50), 200))
        |> offset(int.max(number(c, "offset", 0), 0))
        |> all(ctx.db),
      )
      json.array(rows, fn(row) { json.object(fields(row)) })
    }
    respond.json(c, work)
  })
  |> hono.post("/", fn(c) {
    let work = {
      use user <- task.then(authenticate(ctx, c))
      use body <- task.then(
        hono.json_body(c)
        |> task.attempt_result
        |> task.rescue(fn(_) { task.ok(js.coerce(json.object([]))) }),
      )
      use name <- task.then(
        case decode.run(body, decode.at(["name"], decode.string)) {
          Ok(name) -> {
            let name = string.trim(name)
            case name != "" && js.string_length(name) <= 120 {
              True -> task.ok(name)
              False ->
                task.fail(error.InvalidRequest(
                  "Invalid input: name must contain 1 to 120 characters",
                ))
            }
          }
          Error(_) ->
            task.fail(error.InvalidRequest("Invalid input: name is required"))
        },
      )
      let jti = crypto.random_uuid()
      let token =
        jwt.sign(
          json.object([
            #("did", json.string(user.did)),
            #("jti", json.string(jti)),
            #("type", json.string(verify_token.access_token_type)),
            #("iat", json.int(js.now_ms() / 1000)),
          ]),
          ctx.env.jwt_secret,
          None,
        )
      use encrypted <- task.then(
        crypto.secretbox_encrypt(token, ctx.env.storage_encryption_key)
        |> task.attempt_result,
      )
      let table = a.table()
      use record <- task.map(
        insert(table, [
          set(a.user_id(table), user.id),
          set(a.name(table), name),
          set(a.jti(table), jti),
          set(a.token_encrypted(table), encrypted),
          set(a.last_four(table), string.slice(token, -4, 4)),
        ])
        |> returning_one_as(
          selection(table),
          ctx.db,
          "Access token not created",
        ),
      )
      json.object([#("token", json.string(token)), ..fields(record)])
    }
    respond.json(c, work)
  })
  |> hono.delete("/:id", fn(c) {
    let work = {
      use user <- task.then(authenticate(ctx, c))
      let table = a.table()
      use removed <- task.then(
        delete(
          table,
          and([
            eq(a.id(table), hono.param(c, "id")),
            eq(a.user_id(table), user.id),
          ]),
        )
        |> returning_as(field("id", a.id(table)), ctx.db),
      )
      case removed {
        [] -> task.fail(error.NotFound("Not found"))
        _ -> task.ok(json.object([#("success", json.bool(True))]))
      }
    }
    respond.json(c, work)
  })
}
