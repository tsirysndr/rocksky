//// Request authentication for the REST (Hono) routes.

import gleam/option.{type Option, None, Some}
import gleam/string
import rocksky_api/context.{type Context}
import rocksky_api/drizzle/orm.{eq, from, one, or, where}
import rocksky_api/drizzle/schema/users as u
import rocksky_api/error
import rocksky_api/lib/verify_token
import rocksky_api/node/hono.{type Context as Request}
import rocksky_api/schema/users.{type User}
import rocksky_api/task.{type Task}

/// The token after `Bearer `, ignoring the literal `"null"` clients send.
pub fn bearer(c: Request) -> Option(String) {
  case hono.header(c, "authorization") {
    Some(h) ->
      case string.split(h, " ") {
        [_, token, ..] ->
          case string.trim(token) {
            "" | "null" -> None
            t -> Some(t)
          }
        _ -> None
      }
    None -> None
  }
}

/// The DID of the caller, or `Unauthorized`.
pub fn did(ctx: Context, c: Request) -> Task(String) {
  case bearer(c) {
    None -> task.fail(error.Unauthorized("Unauthorized"))
    Some(token) -> verify_token.verify_did(ctx.env, ctx.db, token)
  }
}

/// The DID when a token is present and valid; `None` for anonymous callers.
pub fn optional_did(ctx: Context, c: Request) -> Task(Option(String)) {
  case bearer(c) {
    None -> task.ok(None)
    Some(token) ->
      task.map(verify_token.verify(ctx.env, ctx.db, token), fn(p) { p.did })
  }
}

pub fn user_by_did(ctx: Context, did: String) -> Task(Option(User)) {
  let table = u.table()
  from(table) |> where(eq(u.did(table), did)) |> one(ctx.db)
}

/// Matches a DID or a handle.
pub fn user_by_did_or_handle(
  ctx: Context,
  actor: String,
) -> Task(Option(User)) {
  let table = u.table()
  from(table)
  |> where(or([eq(u.did(table), actor), eq(u.handle(table), actor)]))
  |> one(ctx.db)
}

/// The authenticated user row, or `Unauthorized`.
pub fn user(ctx: Context, c: Request) -> Task(User) {
  use did <- task.then(did(ctx, c))
  use user <- task.try_map(user_by_did(ctx, did))
  case user {
    Some(u) -> Ok(u)
    None -> Error(error.Unauthorized("Unauthorized"))
  }
}

pub fn require_user(ctx: Context, did: String) -> Task(User) {
  use user <- task.try_map(user_by_did(ctx, did))
  case user {
    Some(u) -> Ok(u)
    None -> Error(error.Unauthorized("Unauthorized"))
  }
}
