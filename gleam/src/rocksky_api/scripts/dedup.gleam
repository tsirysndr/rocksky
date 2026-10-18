//// Remove scrobble records absent from the local index. Pagination is forwarded
//// correctly so a retained first page cannot trap the command in a loop.

import gleam/option.{None, Some}
import rocksky_api/atproto/agent as atp
import rocksky_api/context.{type Context}
import rocksky_api/drizzle/orm.{eq, from, one, where}
import rocksky_api/drizzle/schema/scrobbles as sc
import rocksky_api/error
import rocksky_api/lib/agent
import rocksky_api/scripts/common
import rocksky_api/task

pub fn sweep(
  ctx: Context,
  agent: atp.Agent,
  did: String,
  cursor: option.Option(String),
) {
  use page <- task.then(
    atp.list_records(agent, did, "app.rocksky.scrobble", 100, cursor, False)
    |> task.attempt_result,
  )
  use _ <- task.then(
    common.each(page.records, fn(record) {
      let table = sc.table()
      use existing <- task.then(
        from(table) |> where(eq(sc.uri(table), Some(record.uri))) |> one(ctx.db),
      )
      case existing {
        Some(_) -> task.ok(Nil)
        None -> {
          use _ <- task.then(
            atp.delete_record(
              agent,
              did,
              "app.rocksky.scrobble",
              atp.rkey_of(record.uri),
            )
            |> task.attempt_result,
          )
          task.sleep(1000) |> task.attempt
        }
      }
    }),
  )
  case page.cursor {
    Some(next) -> sweep(ctx, agent, did, Some(next))
    None -> task.ok(Nil)
  }
}

pub fn execute(ctx: Context, args: List(String)) {
  case args {
    [actor, ..] -> {
      use did <- task.then(common.actor(ctx, actor))
      use agent <- task.then(agent.require(ctx, did))
      sweep(ctx, agent, did, None)
    }
    _ ->
      task.fail(error.InvalidRequest(
        "Usage: gleam run -m rocksky_api/scripts/dedup -- <handle|did>",
      ))
  }
}

pub fn main() {
  common.run(execute)
}
