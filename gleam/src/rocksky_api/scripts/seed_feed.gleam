import gleam/dynamic/decode
import gleam/option.{None}
import rocksky_api/atproto/agent as atp
import rocksky_api/context.{type Context}
import rocksky_api/drizzle/orm.{
  eq, from, insert, on_conflict_do_nothing, required, run, set, where,
}
import rocksky_api/drizzle/schema/feeds as fe
import rocksky_api/drizzle/schema/users as us
import rocksky_api/error
import rocksky_api/lexicon/models
import rocksky_api/lib/agent
import rocksky_api/scripts/common
import rocksky_api/task

pub fn execute(ctx: Context, args: List(String)) {
  case args {
    [actor, ..] -> {
      use did <- task.then(common.actor(ctx, actor))
      use agent <- task.then(agent.require(ctx, did))
      let users = us.table()
      use user <- task.then(
        from(users)
        |> where(eq(us.did(users), did))
        |> required(ctx.db, "User not found"),
      )
      use page <- task.then(
        atp.list_records(
          agent,
          did,
          "app.rocksky.feed.generator",
          100,
          None,
          False,
        )
        |> task.attempt_result,
      )
      common.each(page.records, fn(record) {
        case decode.run(record.value, generator_decoder()) {
          Error(_) -> task.ok(Nil)
          Ok(value) -> {
            let feeds = fe.table()
            insert(feeds, [
              set(fe.display_name(feeds), value.display_name),
              set(fe.description(feeds), value.description),
              set(fe.did(feeds), value.did),
              set(fe.user_id(feeds), user.id),
              set(fe.uri(feeds), record.uri),
            ])
            |> on_conflict_do_nothing
            |> run(ctx.db)
            |> task.map(fn(_) { Nil })
          }
        }
      })
    }
    _ ->
      task.fail(error.InvalidRequest(
        "Usage: gleam run -m rocksky_api/scripts/seed_feed -- <handle|did>",
      ))
  }
}

pub fn main() {
  common.run(execute)
}

fn generator_decoder() {
  use value <- decode.then(models.generator_record_decoder())
  use kind <- decode.field("$type", decode.string)
  case kind {
    "app.rocksky.feed.generator" | "app.rocksky.feed.generator#main" ->
      decode.success(value)
    _ -> decode.failure(value, "Feed generator record")
  }
}
