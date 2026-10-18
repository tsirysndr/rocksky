import gleam/option.{type Option, None, Some}
import gleam/string
import rocksky_api/context.{type Context}
import rocksky_api/drizzle/orm.{
  and, eq, eq_columns, field, inner_join, one, select, where,
}
import rocksky_api/drizzle/schema/mirror_sources as m
import rocksky_api/drizzle/schema/users as u
import rocksky_api/task

pub fn resolve(
  stored: Option(Bool),
  did: Option(String),
  disabled: String,
) -> Bool {
  case stored, did {
    Some(value), _ -> value
    None, Some(did) -> !string.contains(disabled, did)
    None, None -> True
  }
}

pub fn read(ctx: Context, did: String) {
  let sources = m.table()
  let users = u.table()
  use value <- task.map(
    select(sources, field("push_enabled", m.push_enabled(sources)))
    |> inner_join(users, eq_columns(m.user_id(sources), u.id(users)))
    |> where(and([eq(u.did(users), did), eq(m.provider(sources), "tealfm")]))
    |> one(ctx.db),
  )
  option.flatten(value)
}

pub fn is_enabled(ctx: Context, did: String) {
  use value <- task.map(read(ctx, did))
  resolve(value, Some(did), ctx.env.disabled_tealfm)
}
