import gleam/dynamic/decode
import gleam/int
import gleam/json
import gleam/list
import gleam/option.{None, Some}
import rocksky_api/context.{type Context}
import rocksky_api/db/row
import rocksky_api/drizzle/orm.{
  all, and, delete, eq, from, insert, limit, offset, returning_one, run, set,
  update, where,
}
import rocksky_api/drizzle/schema/api_keys as k
import rocksky_api/error
import rocksky_api/lib/auth
import rocksky_api/lib/respond
import rocksky_api/node/crypto
import rocksky_api/node/hono
import rocksky_api/schema/api_keys.{type ApiKey}
import rocksky_api/task

fn mutation_view(key: ApiKey) {
  json.object([
    #("id", json.string(key.id)),
    #("name", json.string(key.name)),
    #("description", json.nullable(key.description, json.string)),
    #("api_key", json.string(key.api_key)),
    #("shared_secret", json.string(key.shared_secret)),
  ])
}

fn list_view(key: ApiKey) {
  json.object([
    #("id", json.string(key.id)),
    #("name", json.string(key.name)),
    #("description", json.nullable(key.description, json.string)),
    #("apiKey", json.string(key.api_key)),
    #("sharedSecret", json.string(key.shared_secret)),
    #("enabled", json.bool(key.enabled)),
    #("createdAt", json.string(row.iso8601(key.created_at))),
    #("updatedAt", json.string(row.iso8601(key.updated_at))),
  ])
}

fn number(c: hono.Context, name: String, default: Int) {
  hono.query(c, name)
  |> option.then(fn(s) { int.parse(s) |> option.from_result })
  |> option.then(fn(n) {
    case n == 0 {
      True -> None
      False -> Some(n)
    }
  })
  |> option.unwrap(default)
}

fn create_decoder() {
  use name <- decode.field("name", decode.string)
  use description <- decode.optional_field(
    "description",
    None,
    decode.optional(decode.string),
  )
  use enabled <- decode.optional_field("enabled", True, decode.bool)
  case name {
    "" -> decode.failure(#(name, description, enabled), "Nonempty name")
    _ -> decode.success(#(name, description, enabled))
  }
}

fn patch_field(name, decoder, column, next) {
  use value <- decode.optional_field(name, None, decode.map(decoder, Some))
  next(case value {
    Some(value) -> [set(column, value)]
    None -> []
  })
}

fn patch_decoder(table) {
  use id <- patch_field("id", decode.string, k.id(table))
  use name <- patch_field("name", decode.string, k.name(table))
  use description <- patch_field(
    "description",
    decode.optional(decode.string),
    k.description(table),
  )
  use enabled <- patch_field("enabled", decode.bool, k.enabled(table))
  use api_key <- patch_field("apiKey", decode.string, k.api_key(table))
  use secret <- patch_field(
    "sharedSecret",
    decode.string,
    k.shared_secret(table),
  )
  use user <- patch_field("userId", decode.string, k.user_id(table))
  use created <- patch_field("createdAt", row.timestamp(), k.created_at(table))
  use updated <- patch_field("updatedAt", row.timestamp(), k.updated_at(table))
  decode.success(
    list.flatten([
      id,
      name,
      description,
      enabled,
      api_key,
      secret,
      user,
      created,
      updated,
    ]),
  )
}

pub fn app(ctx: Context) {
  hono.new()
  |> hono.get("/", fn(c) {
    let work = {
      use user <- task.then(auth.user(ctx, c))
      let table = k.table()
      use keys <- task.map(
        from(table)
        |> where(eq(k.user_id(table), user.id))
        |> limit(number(c, "size", 20))
        |> offset(number(c, "offset", 0))
        |> all(ctx.db),
      )
      json.array(keys, list_view)
    }
    respond.json(c, work)
  })
  |> hono.post("/", fn(c) {
    let work = {
      use user <- task.then(auth.user(ctx, c))
      use body <- task.then(hono.json_body(c) |> task.attempt_result)
      use data <- task.then(
        decode.run(body, create_decoder())
        |> error.decode("Invalid api key data", _)
        |> task.from_result,
      )
      let table = k.table()
      use key <- task.map(
        insert(table, [
          set(k.name(table), data.0),
          set(k.description(table), Some(option.unwrap(data.1, ""))),
          set(k.enabled(table), data.2),
          set(k.api_key(table), crypto.random_bytes_hex(16)),
          set(k.shared_secret(table), crypto.random_bytes_hex(16)),
          set(k.user_id(table), user.id),
        ])
        |> returning_one(ctx.db, "API key not created"),
      )
      mutation_view(key)
    }
    respond.json(c, work)
  })
  |> hono.put("/:id", fn(c) {
    let work = {
      use user <- task.then(auth.user(ctx, c))
      use body <- task.then(hono.json_body(c) |> task.attempt_result)
      let table = k.table()
      use patch <- task.then(
        decode.run(body, patch_decoder(table))
        |> error.decode("API key patch", _)
        |> task.from_result,
      )
      use key <- task.map(
        update(
          table,
          patch,
          and([
            eq(k.id(table), hono.param(c, "id")),
            eq(k.user_id(table), user.id),
          ]),
        )
        |> returning_one(ctx.db, "API key not found"),
      )
      mutation_view(key)
    }
    respond.json(c, work)
  })
  |> hono.delete("/:id", fn(c) {
    let work = {
      use user <- task.then(auth.user(ctx, c))
      let table = k.table()
      use _ <- task.map(
        delete(
          table,
          and([
            eq(k.id(table), hono.param(c, "id")),
            eq(k.user_id(table), user.id),
          ]),
        )
        |> run(ctx.db),
      )
      json.object([#("success", json.bool(True))])
    }
    respond.json(c, work)
  })
}
